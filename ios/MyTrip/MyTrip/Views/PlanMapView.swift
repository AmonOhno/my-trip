import MapKit
import SwiftUI

/// 計画の「行きたい場所」を並べる地図 (Issue #14)。
/// `picking` が有効な間は、地図のタップで座標を拾って呼び出し側へ渡す。
struct PlanMapView: View {
    let pins: [PlanPin]
    var picking: Bool = false
    var focusPinId: UUID?
    var onPick: (CLLocationCoordinate2D) -> Void = { _ in }
    var onSelectPin: (UUID) -> Void = { _ in }

    @State private var camera = MapCameraPosition.automatic

    var body: some View {
        MapReader { proxy in
            Map(position: $camera) {
                ForEach(pins) { pin in
                    Annotation(pin.name, coordinate: pin.coordinate) {
                        Button {
                            onSelectPin(pin.id)
                        } label: {
                            Text("\(pin.number)")
                                .font(.footnote.bold())
                                .foregroundStyle(.white)
                                .frame(width: 26, height: 26)
                                .background(Color.orange, in: .circle)
                                .overlay(Circle().stroke(.white, lineWidth: 2))
                        }
                        .accessibilityLabel("\(pin.number). \(pin.name)")
                    }
                }
            }
            .onTapGesture { point in
                guard picking, let coordinate = proxy.convert(point, from: .local) else { return }
                onPick(coordinate)
            }
        }
        .onChange(of: focusPinId) { _, newValue in
            guard let pin = pins.first(where: { $0.id == newValue }) else { return }
            withAnimation {
                camera = .region(MKCoordinateRegion(
                    center: pin.coordinate,
                    latitudinalMeters: 800,
                    longitudinalMeters: 800
                ))
            }
        }
    }
}
