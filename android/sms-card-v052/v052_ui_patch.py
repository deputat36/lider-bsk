from pathlib import Path

p=Path("android/build-src/sms-card-app/app/src/main/java/ru/etagi/borisoglebsk/smscard/MainActivity.java")
s=p.read_text()
def change(old,new,label):
    global s
    if old not in s: raise RuntimeError("MainActivity patch marker missing: "+label)
    s=s.replace(old,new,1)

change('import android.view.Gravity;\n',
'''import android.view.Gravity;
import android.view.WindowInsets;
''','insets import')
change('import java.util.Date;\n',
'''import java.util.ArrayList;
import java.util.Date;
''','collections import')
change('''        buildShell();
        showHome();
    }

    @Override
    protected void onNewIntent''',
'''        buildShell();
        if (savedInstanceState != null) {
            String tab = savedInstanceState.getString("active_tab", "send");
            if ("settings".equals(tab)) showSettings();
            else if ("history".equals(tab)) showHistory();
            else showHome();
            Bundle formState = new Bundle(savedInstanceState);
            content.post(() -> restoreInputs(formState));
        } else {
            showHome();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        outState.putString("active_tab", tabSettings != null && tabSettings.isSelected()
                ? "settings" : (tabHistory != null && tabHistory.isSelected() ? "history" : "send"));
        ArrayList<String> texts = new ArrayList<>();
        ArrayList<Integer> positions = new ArrayList<>();
        ArrayList<Boolean> checked = new ArrayList<>();
        collectInputs(content, texts, positions, checked);
        outState.putStringArrayList("form_texts", texts);
        outState.putIntegerArrayList("form_positions", positions);
        outState.putSerializable("form_checked", checked);
        super.onSaveInstanceState(outState);
    }

    private void collectInputs(View view, ArrayList<String> texts,
                               ArrayList<Integer> positions, ArrayList<Boolean> checked) {
        if (view instanceof EditText) texts.add(((EditText)view).getText().toString());
        else if (view instanceof Spinner) positions.add(((Spinner)view).getSelectedItemPosition());
        else if (view instanceof CheckBox) checked.add(((CheckBox)view).isChecked());
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)view;
            for (int i=0; i<group.getChildCount(); i++) {
                collectInputs(group.getChildAt(i), texts, positions, checked);
            }
        }
    }

    private void restoreInputs(Bundle state) {
        ArrayList<String> texts = state.getStringArrayList("form_texts");
        ArrayList<Integer> positions = state.getIntegerArrayList("form_positions");
        @SuppressWarnings("unchecked")
        ArrayList<Boolean> checked = (ArrayList<Boolean>)state.getSerializable("form_checked");
        if (texts == null || positions == null || checked == null) return;
        restoreInputFields(content, texts, positions, checked, new int[]{0,0,0}, true);
        // Restore text *after* spinner selections because a template selection
        // may replace the unsaved template editor body.
        content.post(() -> restoreInputFields(content, texts, positions, checked,
                new int[]{0,0,0}, false));
    }

    private void restoreInputFields(View view, ArrayList<String> texts,
                        ArrayList<Integer> positions, ArrayList<Boolean> checked,
                        int[] index, boolean controlsOnly) {
        if (view instanceof EditText) {
            if (!controlsOnly && index[0] < texts.size()) {
                ((EditText)view).setText(texts.get(index[0]));
            }
            index[0]++;
        } else if (view instanceof Spinner) {
            if (controlsOnly && index[1] < positions.size()
                    && positions.get(index[1]) >= 0) {
                ((Spinner)view).setSelection(positions.get(index[1]));
            }
            index[1]++;
        } else if (view instanceof CheckBox) {
            if (controlsOnly && index[2] < checked.size()) {
                ((CheckBox)view).setChecked(checked.get(index[2]));
            }
            index[2]++;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)view;
            for (int i=0; i<group.getChildCount(); i++) {
                restoreInputFields(group.getChildAt(i), texts, positions, checked,
                        index, controlsOnly);
            }
        }
    }

    @Override
    protected void onNewIntent''','rotation restore')
change('''        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        TextView header''',
'''        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            root.requestApplyInsets();
        }

        TextView header''','edge to edge insets')
p.write_text(s)
print("UI fix patch applied.")
