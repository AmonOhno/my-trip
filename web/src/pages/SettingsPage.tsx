import { useRef, useState } from "react";
import { navigate } from "../app/router";
import { clearAll } from "../core/db";
import { downloadExport, exportAll, importAll } from "../core/exportImport";
import { getSettings, saveSettings } from "../core/settings";

export function SettingsPage() {
  const [settings, setSettings] = useState(getSettings);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clearDialogRef = useRef<HTMLDialogElement>(null);

  const toggleGeocode = (on: boolean) => {
    const next = { ...settings, reverseGeocode: on };
    setSettings(next);
    saveSettings(next);
  };

  const onExport = async () => {
    downloadExport(await exportAll());
    setMessage("エクスポートファイルをダウンロードしました。");
  };

  const onImportFile = async (file: File) => {
    try {
      const count = await importAll(await file.text());
      setMessage(`${count}件の旅を取り込みました。`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "インポートに失敗しました。");
    }
  };

  const onClearAll = async () => {
    clearDialogRef.current?.close();
    await clearAll();
    setMessage("すべてのデータを削除しました。");
  };

  return (
    <>
      <header className="appbar">
        <button type="button" className="icon-btn" onClick={() => navigate("/")} aria-label="ホームへ戻る">
          ←
        </button>
        <h1>設定</h1>
      </header>

      <div className="stack">
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.reverseGeocode}
            onChange={(e) => toggleGeocode(e.target.checked)}
          />
          <span>
            スポット名を自動取得する
            <br />
            <span className="muted">
              OpenStreetMap (Nominatim) にスポットの座標のみを送信して地名を取得します。オフにすると「スポット
              1」のような仮名になります(後から編集できます)。
            </span>
          </span>
        </label>

        <h2 className="section-title">データ</h2>
        <p className="muted">
          すべての記録はこの端末のブラウザ内にのみ保存されます。機種変更やバックアップにはエクスポートをご利用ください(iOSアプリと共通形式)。
        </p>
        <div className="row">
          <button type="button" onClick={onExport}>
            エクスポート (JSON)
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            インポート
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
        </div>

        <h2 className="section-title">危険な操作</h2>
        <button type="button" className="btn-danger" onClick={() => clearDialogRef.current?.showModal()}>
          すべてのデータを削除
        </button>

        {message ? (
          <p className="notice" role="status">
            {message}
          </p>
        ) : null}
      </div>

      <dialog ref={clearDialogRef} aria-labelledby="clear-title">
        <div className="stack">
          <h2 id="clear-title" style={{ fontSize: 17 }}>すべて削除しますか?</h2>
          <p className="muted">全旅の記録が完全に削除されます。必要ならエクスポートを先に行ってください。</p>
          <div className="row">
            <button type="button" onClick={() => clearDialogRef.current?.close()}>
              キャンセル
            </button>
            <div className="spacer" />
            <button type="button" className="btn-danger" onClick={onClearAll}>
              削除する
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
