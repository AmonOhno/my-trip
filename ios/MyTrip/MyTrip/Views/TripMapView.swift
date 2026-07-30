import CoreLocation
import GoogleMaps
import MapKit
import SwiftUI

/// 地図に立てるピン1件
struct TripMapMarker: Identifiable, Equatable {
    let id: String
    let title: String
    let latitude: Double
    let longitude: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

/// 「この地点へ寄せる」指示。同じ地点を続けてタップしても動くよう token で世代を持つ
struct TripMapFocus: Equatable {
    let latitude: Double
    let longitude: Double
    var meters: CLLocationDistance = 600
    var token: Int = 0

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

/// 旅の軌跡とスポットを描く地図 (Issue #6)。
///
/// Google Maps SDK のAPIキーが設定されていれば Google マップで描画し、
/// 未設定なら MapKit で描画する。呼び出し側はどちらで描かれるか意識しなくてよい。
struct TripMapView: View {
    var track: [CLLocationCoordinate2D] = []
    var markers: [TripMapMarker] = []
    /// 現在地ドットと現在地ボタンを出す(記録中画面用)
    var showsUserLocation = false
    /// 追従したい現在地。Googleマップ描画時のみ効く(MapKit時は内容に自動フィット)
    var follow: CLLocationCoordinate2D?
    /// 指定地点へ寄せる(タイムライン連動用)
    var focus: TripMapFocus?

    var body: some View {
        if GoogleMapsConfig.isEnabled {
            GoogleTripMap(
                track: track,
                markers: markers,
                showsUserLocation: showsUserLocation,
                follow: follow,
                focus: focus
            )
            .accessibilityLabel("旅の軌跡地図")
        } else {
            AppleTripMap(
                track: track,
                markers: markers,
                showsUserLocation: showsUserLocation,
                focus: focus
            )
            .accessibilityLabel("旅の軌跡地図")
        }
    }
}

// MARK: - Google マップ描画

/// レイアウト確定を検知するための GMSMapView。
/// 初回フィットはビューのサイズが決まってからでないと効かない
private final class LayoutAwareMapView: GMSMapView {
    var onLayout: (() -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }
}

private struct GoogleTripMap: UIViewRepresentable {
    var track: [CLLocationCoordinate2D]
    var markers: [TripMapMarker]
    var showsUserLocation: Bool
    var follow: CLLocationCoordinate2D?
    var focus: TripMapFocus?

    /// 初期表示(データが乗り次第フィットする): 東京駅付近
    private static let initialCamera = GMSCameraPosition(latitude: 35.681, longitude: 139.767, zoom: 12)

    func makeUIView(context: Context) -> GMSMapView {
        let mapView = LayoutAwareMapView()
        mapView.camera = Self.initialCamera
        mapView.settings.compassButton = true
        mapView.onLayout = { [weak mapView] in
            guard let mapView else { return }
            context.coordinator.fitContentIfNeeded(mapView)
        }
        return mapView
    }

    func updateUIView(_ mapView: GMSMapView, context: Context) {
        let coordinator = context.coordinator
        mapView.isMyLocationEnabled = showsUserLocation
        mapView.settings.myLocationButton = showsUserLocation

        coordinator.applyTrack(track, to: mapView)
        coordinator.applyMarkers(markers, to: mapView)
        coordinator.fitContentIfNeeded(mapView)
        coordinator.applyFollow(follow, to: mapView)
        coordinator.applyFocus(focus, to: mapView)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// 地図オブジェクトを作り直さず差分だけ反映する。
    /// GMSMapView.clear() は現在地ドットまで消えるため使わない
    final class Coordinator {
        private var polyline: GMSPolyline?
        private var markerLayer: [GMSMarker] = []
        private var appliedTrackCount = 0
        private var appliedMarkers: [TripMapMarker] = []
        private var appliedFollow: CLLocationCoordinate2D?
        private var appliedFocus: TripMapFocus?
        private var contentBounds: GMSCoordinateBounds?
        private var didFitContent = false

        func applyTrack(_ track: [CLLocationCoordinate2D], to mapView: GMSMapView) {
            guard track.count != appliedTrackCount else { return }
            appliedTrackCount = track.count
            let path = GMSMutablePath()
            for coordinate in track {
                path.add(coordinate)
            }
            if let polyline {
                polyline.path = path
            } else {
                let line = GMSPolyline(path: path)
                line.strokeColor = .orange
                line.strokeWidth = 4
                line.map = mapView
                polyline = line
            }
            updateContentBounds()
        }

        func applyMarkers(_ markers: [TripMapMarker], to mapView: GMSMapView) {
            guard markers != appliedMarkers else { return }
            appliedMarkers = markers
            for marker in markerLayer {
                marker.map = nil
            }
            markerLayer = markers.map { item in
                let marker = GMSMarker(position: item.coordinate)
                marker.title = item.title
                marker.icon = GMSMarker.markerImage(with: .orange)
                marker.map = mapView
                return marker
            }
            updateContentBounds()
        }

        /// 中身が乗り、かつレイアウトが確定してから一度だけ全体を映す
        func fitContentIfNeeded(_ mapView: GMSMapView) {
            guard !didFitContent,
                  let bounds = contentBounds,
                  bounds.isValid,
                  mapView.bounds.width > 0, mapView.bounds.height > 0
            else { return }
            mapView.moveCamera(GMSCameraUpdate.fit(bounds, withPadding: 32))
            didFitContent = true
        }

        func applyFollow(_ follow: CLLocationCoordinate2D?, to mapView: GMSMapView) {
            guard let follow, !isSame(follow, appliedFollow) else { return }
            appliedFollow = follow
            mapView.animate(to: GMSCameraPosition(
                target: follow,
                zoom: max(mapView.camera.zoom, 15)
            ))
        }

        func applyFocus(_ focus: TripMapFocus?, to mapView: GMSMapView) {
            guard let focus, focus != appliedFocus else { return }
            appliedFocus = focus
            mapView.animate(to: GMSCameraPosition(target: focus.coordinate, zoom: 15))
        }

        private func updateContentBounds() {
            var coordinates = appliedMarkers.map(\.coordinate)
            if let path = polyline?.path {
                for index in 0..<path.count() {
                    coordinates.append(path.coordinate(at: index))
                }
            }
            guard let first = coordinates.first else {
                contentBounds = nil
                return
            }
            var bounds = GMSCoordinateBounds(coordinate: first, coordinate: first)
            for coordinate in coordinates.dropFirst() {
                bounds = bounds.includingCoordinate(coordinate)
            }
            contentBounds = bounds
        }

        private func isSame(_ lhs: CLLocationCoordinate2D, _ rhs: CLLocationCoordinate2D?) -> Bool {
            guard let rhs else { return false }
            return lhs.latitude == rhs.latitude && lhs.longitude == rhs.longitude
        }
    }
}

// MARK: - MapKit 描画(APIキー未設定時のフォールバック)

private struct AppleTripMap: View {
    var track: [CLLocationCoordinate2D]
    var markers: [TripMapMarker]
    var showsUserLocation: Bool
    var focus: TripMapFocus?

    @State private var camera = MapCameraPosition.automatic

    var body: some View {
        Map(position: $camera) {
            if showsUserLocation {
                UserAnnotation()
            }
            if track.count > 1 {
                MapPolyline(coordinates: track)
                    .stroke(.orange, lineWidth: 4)
            }
            ForEach(markers) { marker in
                Marker(marker.title, coordinate: marker.coordinate)
                    .tint(.orange)
            }
        }
        .mapControls {
            if showsUserLocation {
                MapUserLocationButton()
            }
        }
        .onChange(of: focus) { _, newValue in
            guard let newValue else { return }
            withAnimation {
                camera = .region(MKCoordinateRegion(
                    center: newValue.coordinate,
                    latitudinalMeters: newValue.meters,
                    longitudinalMeters: newValue.meters
                ))
            }
        }
    }
}
