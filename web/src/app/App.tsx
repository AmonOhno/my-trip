import { useEffect } from "react";
import { recorder } from "../core/recorder";
import { HomePage } from "../pages/HomePage";
import { RecordingPage } from "../pages/RecordingPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TripDetailPage } from "../pages/TripDetailPage";
import { TripListPage } from "../pages/TripListPage";
import { useRoute } from "./router";

export function App() {
  const route = useRoute();

  // 中断された記録セッションの復元 (F-06)
  useEffect(() => {
    void recorder.restore();
  }, []);

  switch (route.name) {
    case "home":
      return <HomePage />;
    case "recording":
      return <RecordingPage />;
    case "trips":
      return <TripListPage />;
    case "trip":
      return <TripDetailPage tripId={route.id} />;
    case "settings":
      return <SettingsPage />;
  }
}
