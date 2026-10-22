package __PKG__;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Озвучка системным синтезатором Android (TextToSpeech).
 * JS: registerPlugin("RecnikSpeech").speak({ text, lang, rate }) — резолвится, когда фраза произнесена.
 * Коды ошибок: NO_ENGINE (нет синтезатора), LANG_UNAVAILABLE (нет голоса/данных языка), FAILED.
 */
@CapacitorPlugin(name = "RecnikSpeech")
public class RecnikSpeechPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean ready = false;
    private boolean failed = false;
    private final List<Runnable> waiting = new ArrayList<>();
    private PluginCall active;
    private long seq = 0;

    @Override
    public void load() {
        ensure();
    }

    private synchronized void ensure() {
        if (tts != null || failed) return;
        try {
            tts = new TextToSpeech(getContext().getApplicationContext(), status -> {
                List<Runnable> run;
                synchronized (RecnikSpeechPlugin.this) {
                    ready = status == TextToSpeech.SUCCESS;
                    failed = !ready;
                    run = new ArrayList<>(waiting);
                    waiting.clear();
                }
                if (ready) {
                    tts.setOnUtteranceProgressListener(listener);
                }
                for (Runnable r : run) r.run();
            });
        } catch (Exception e) {
            failed = true;
        }
    }

    private final UtteranceProgressListener listener = new UtteranceProgressListener() {
        @Override
        public void onStart(String utteranceId) {}

        @Override
        public void onDone(String utteranceId) {
            finish(utteranceId, null);
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onError(String utteranceId) {
            finish(utteranceId, "FAILED");
        }

        @Override
        public void onError(String utteranceId, int errorCode) {
            finish(utteranceId, "FAILED");
        }

        @Override
        public void onStop(String utteranceId, boolean interrupted) {
            finish(utteranceId, null);
        }
    };

    private synchronized void finish(String id, String error) {
        PluginCall call = active;
        if (call == null || !id.equals(call.getData().optString("_id"))) return;
        active = null;
        if (error == null) call.resolve();
        else call.reject("Speech failed", error);
    }

    @PluginMethod
    public void speak(final PluginCall call) {
        final String text = call.getString("text", "");
        final String lang = call.getString("lang", "en-US");
        final Float rate = call.getFloat("rate", 0.92f);
        if (text == null || text.trim().isEmpty()) {
            call.resolve();
            return;
        }
        ensure();
        Runnable go = () -> {
            if (!ready || tts == null) {
                call.reject("No TTS engine", "NO_ENGINE");
                return;
            }
            Locale locale = Locale.forLanguageTag(lang);
            int r = tts.setLanguage(locale);
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                call.reject("Language unavailable: " + lang, "LANG_UNAVAILABLE");
                return;
            }
            tts.setSpeechRate(rate);
            final String id = "recnik-" + (++seq);
            synchronized (RecnikSpeechPlugin.this) {
                // новый запрос вытесняет предыдущий
                if (active != null) {
                    PluginCall prev = active;
                    active = null;
                    prev.resolve();
                }
                try {
                    call.getData().put("_id", id);
                } catch (Exception ignored) {}
                active = call;
            }
            Bundle params = new Bundle();
            int q = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id);
            if (q != TextToSpeech.SUCCESS) {
                synchronized (RecnikSpeechPlugin.this) {
                    if (active == call) active = null;
                }
                call.reject("Speech failed", "FAILED");
            }
        };
        synchronized (this) {
            if (failed) {
                call.reject("No TTS engine", "NO_ENGINE");
                return;
            }
            if (!ready) {
                waiting.add(go);
                return;
            }
        }
        go.run();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null && ready) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }
}
