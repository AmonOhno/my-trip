import { useSyncExternalStore } from "react";
import { recorder, type RecorderState } from "../core/recorder";

export function useRecorder(): RecorderState {
  return useSyncExternalStore(recorder.subscribe, recorder.getSnapshot);
}
