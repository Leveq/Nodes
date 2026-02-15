import { useState, useEffect, useCallback } from "react";
import { useVoiceStore } from "../../stores/voice-store";

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
}

/**
 * Voice & Video settings section.
 * Allows users to configure audio devices and voice settings.
 */
export function VoiceSettings() {
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  // Voice store state
  const inputDeviceId = useVoiceStore((s) => s.inputDeviceId);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const inputVolume = useVoiceStore((s) => s.inputVolume);
  const noiseSuppression = useVoiceStore((s) => s.noiseSuppression);
  const echoCancellation = useVoiceStore((s) => s.echoCancellation);
  const pushToTalk = useVoiceStore((s) => s.pushToTalk);
  const pushToTalkKey = useVoiceStore((s) => s.pushToTalkKey);

  // Voice store actions
  const setInputDevice = useVoiceStore((s) => s.setInputDevice);
  const setOutputDevice = useVoiceStore((s) => s.setOutputDevice);
  const setInputVolume = useVoiceStore((s) => s.setInputVolume);
  const setNoiseSuppression = useVoiceStore((s) => s.setNoiseSuppression);
  const setEchoCancellation = useVoiceStore((s) => s.setEchoCancellation);
  const setPushToTalk = useVoiceStore((s) => s.setPushToTalk);

  // Enumerate audio devices
  const loadDevices = useCallback(async () => {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const inputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 5)}`,
          kind: "audioinput" as const,
        }));
      
      const outputs = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${d.deviceId.slice(0, 5)}`,
          kind: "audiooutput" as const,
        }));

      setInputDevices(inputs);
      setOutputDevices(outputs);
      setPermissionDenied(false);
    } catch (err) {
      console.error("[VoiceSettings] Failed to enumerate devices:", err);
      setPermissionDenied(true);
    }
  }, []);

  useEffect(() => {
    loadDevices();

    // Re-enumerate when devices change
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, [loadDevices]);

  // Mic test visualizer
  useEffect(() => {
    if (!testingMic) {
      setMicLevel(0);
      return;
    }

    let animationFrame: number;
    let audioContext: AudioContext;
    let stream: MediaStream;

    async function startMicTest() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: inputDeviceId || undefined },
        });

        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function updateLevel() {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setMicLevel(Math.min(100, average * 1.5));
          animationFrame = requestAnimationFrame(updateLevel);
        }

        updateLevel();
      } catch (err) {
        console.error("[VoiceSettings] Mic test failed:", err);
        setTestingMic(false);
      }
    }

    startMicTest();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioContext) audioContext.close();
    };
  }, [testingMic, inputDeviceId]);

  // Recording push-to-talk key
  const [recordingPTT, setRecordingPTT] = useState(false);

  useEffect(() => {
    if (!recordingPTT) return;

    function handleKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      const key = e.key === " " ? "Space" : e.key;
      setPushToTalk(true, key);
      setRecordingPTT(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [recordingPTT, setPushToTalk]);

  if (permissionDenied) {
    return (
      <div className="space-y-8">
        <section className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.98l-7-12a2 2 0 00-3.5 0l-7 12A2 2 0 005.07 19z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-nodes-text mb-2">Microphone Access Required</h2>
          <p className="text-nodes-text-muted text-sm mb-4">
            Please allow microphone access to configure voice settings.
          </p>
          <button
            onClick={loadDevices}
            className="px-4 py-2 bg-nodes-primary text-white rounded-lg hover:bg-nodes-primary/90 transition-colors"
          >
            Request Permission
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Input Device */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Input Device</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Select which microphone to use for voice chat.
        </p>
        <select
          value={inputDeviceId || ""}
          onChange={(e) => setInputDevice(e.target.value || null)}
          className="w-full max-w-md px-3 py-2 rounded-lg bg-nodes-bg border border-nodes-border text-nodes-text focus:outline-none focus:border-nodes-primary"
        >
          <option value="">Default</option>
          {inputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>

        {/* Mic Test */}
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => setTestingMic(!testingMic)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              testingMic
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-nodes-bg border border-nodes-border text-nodes-text hover:bg-nodes-surface"
            }`}
          >
            {testingMic ? "Stop Test" : "Test Microphone"}
          </button>
          {testingMic && (
            <div className="flex-1 max-w-xs h-2 bg-nodes-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-75"
                style={{ width: `${micLevel}%` }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Output Device */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Output Device</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Select which speaker or headphones to use for voice chat.
        </p>
        <select
          value={outputDeviceId || ""}
          onChange={(e) => setOutputDevice(e.target.value || null)}
          className="w-full max-w-md px-3 py-2 rounded-lg bg-nodes-bg border border-nodes-border text-nodes-text focus:outline-none focus:border-nodes-primary"
        >
          <option value="">Default</option>
          {outputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </section>

      {/* Input Volume */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Input Volume</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Adjust your microphone volume level.
        </p>
        <div className="flex items-center gap-4 max-w-md">
          <input
            type="range"
            min="0"
            max="100"
            value={inputVolume}
            onChange={(e) => setInputVolume(Number(e.target.value))}
            className="flex-1 accent-nodes-primary"
          />
          <span className="text-nodes-text-muted w-12 text-right">{inputVolume}%</span>
        </div>
      </section>

      {/* Voice Processing */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Voice Processing</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Enable audio processing features to improve voice quality.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={noiseSuppression}
              onChange={(e) => setNoiseSuppression(e.target.checked)}
              className="w-5 h-5 rounded border-nodes-border bg-nodes-bg accent-nodes-primary"
            />
            <div>
              <div className="text-nodes-text">Noise Suppression</div>
              <div className="text-xs text-nodes-text-muted">Reduce background noise from your microphone</div>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={echoCancellation}
              onChange={(e) => setEchoCancellation(e.target.checked)}
              className="w-5 h-5 rounded border-nodes-border bg-nodes-bg accent-nodes-primary"
            />
            <div>
              <div className="text-nodes-text">Echo Cancellation</div>
              <div className="text-xs text-nodes-text-muted">Prevent echo from your speakers being picked up</div>
            </div>
          </label>
        </div>
      </section>

      {/* Push to Talk */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Input Mode</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Choose how your microphone activates.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="inputMode"
              checked={!pushToTalk}
              onChange={() => setPushToTalk(false)}
              className="w-5 h-5 accent-nodes-primary"
            />
            <div>
              <div className="text-nodes-text">Voice Activity</div>
              <div className="text-xs text-nodes-text-muted">Automatically transmit when you speak</div>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="inputMode"
              checked={pushToTalk}
              onChange={() => setPushToTalk(true, pushToTalkKey || undefined)}
              className="w-5 h-5 accent-nodes-primary"
            />
            <div>
              <div className="text-nodes-text">Push to Talk</div>
              <div className="text-xs text-nodes-text-muted">Hold a key to transmit</div>
            </div>
          </label>
        </div>

        {pushToTalk && (
          <div className="mt-4 flex items-center gap-4">
            <span className="text-sm text-nodes-text-muted">Keybind:</span>
            <button
              onClick={() => setRecordingPTT(true)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                recordingPTT
                  ? "border-nodes-primary bg-nodes-primary/10 text-nodes-primary"
                  : "border-nodes-border bg-nodes-bg text-nodes-text hover:bg-nodes-surface"
              }`}
            >
              {recordingPTT ? "Press any key..." : pushToTalkKey || "Click to set"}
            </button>
          </div>
        )}
      </section>

      {/* Keyboard Shortcuts */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Keyboard Shortcuts</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between max-w-md">
            <span className="text-nodes-text-muted">Toggle Mute</span>
            <kbd className="px-2 py-1 rounded bg-nodes-bg border border-nodes-border text-nodes-text text-xs">
              Ctrl + Shift + M
            </kbd>
          </div>
          <div className="flex justify-between max-w-md">
            <span className="text-nodes-text-muted">Toggle Deafen</span>
            <kbd className="px-2 py-1 rounded bg-nodes-bg border border-nodes-border text-nodes-text text-xs">
              Ctrl + Shift + D
            </kbd>
          </div>
        </div>
      </section>
    </div>
  );
}
