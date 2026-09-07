package dev.alloc.vitebare.device;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import to.holepunch.bare.kit.IPC;
import to.holepunch.bare.kit.Worklet;

public class MainActivity extends Activity {
  private static final String TAG = "BareViteDevice";
  private final StringBuilder pending = new StringBuilder();
  private Worklet worklet;
  private IPC ipc;
  private EditText serverUrl;
  private TextView output;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);

    LinearLayout content = new LinearLayout(this);
    content.setOrientation(LinearLayout.VERTICAL);
    content.setPadding(24, 24, 24, 24);

    serverUrl = new EditText(this);
    serverUrl.setHint("ws://192.168.1.100:5173/__bare_vite?environment=bare");
    serverUrl.setSingleLine(true);
    content.addView(serverUrl, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ));

    Button development = new Button(this);
    development.setText("Start development");
    development.setOnClickListener((view) -> startWorklet("dev.bundle", true));
    content.addView(development);

    Button production = new Button(this);
    production.setText("Start production");
    production.setOnClickListener((view) -> startWorklet("production.bundle", false));
    content.addView(production);

    output = new TextView(this);
    output.setTextIsSelectable(true);
    ScrollView scroll = new ScrollView(this);
    scroll.addView(output);
    content.addView(scroll, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      0,
      1
    ));
    setContentView(content);

    String server = getIntent().getStringExtra("serverUrl");
    if (server != null) serverUrl.setText(server);
    String mode = getIntent().getStringExtra("mode");
    if ("development".equals(mode)) {
      startWorklet("dev.bundle", true);
    } else if ("production".equals(mode)) {
      startWorklet("production.bundle", false);
    }
  }

  private void startWorklet(String asset, boolean development) {
    stopWorklet();
    output.setText("");
    pending.setLength(0);

    try {
      byte[] source;
      try (InputStream input = getAssets().open(asset)) {
        source = input.readAllBytes();
      }

      worklet = new Worklet(null);
      String[] arguments = development
        ? new String[] { serverUrl.getText().toString(), "/app/application.ts" }
        : null;
      worklet.start("/app.bundle", ByteBuffer.wrap(source), arguments);
      ipc = new IPC(worklet);
      readNext();
    } catch (IOException error) {
      appendLine("Host error: " + error.getMessage());
    }
  }

  private void readNext() {
    IPC current = ipc;
    if (current == null) return;
    current.read((data, error) -> {
      if (error != null) {
        appendLine("IPC error: " + error.getMessage());
        return;
      }
      if (data == null || current != ipc) return;
      pending.append(StandardCharsets.UTF_8.decode(data));
      flushLines();
      readNext();
    });
  }

  private void flushLines() {
    int newline;
    while ((newline = pending.indexOf("\n")) >= 0) {
      String line = pending.substring(0, newline);
      pending.delete(0, newline + 1);
      appendLine(line);
    }
  }

  private void appendLine(String line) {
    Log.i(TAG, line);
    runOnUiThread(() -> output.append(line + "\n"));
  }

  private void stopWorklet() {
    if (ipc != null) ipc.close();
    if (worklet != null) worklet.terminate();
    ipc = null;
    worklet = null;
  }

  @Override
  protected void onDestroy() {
    stopWorklet();
    super.onDestroy();
  }
}
