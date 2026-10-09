package ru.etagi.borisoglebsk.smscard;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class BulkCampaignActivity extends Activity {
    private static final int REQUEST_CONTACTS = 301;

    private static final int RED = Color.rgb(227, 6, 19);
    private static final int BLACK = Color.rgb(17, 17, 17);
    private static final int SURFACE = Color.rgb(245, 245, 245);
    private static final int BORDER = Color.rgb(225, 225, 225);
    private static final int MUTED = Color.rgb(105, 105, 105);

    private String draftTitle = "";
    private String draftSource = "";
    private String draftRendered = "";
    private int draftTemplate = SmsTemplates.UNIVERSAL;
    private boolean choosingContacts = false;
    private ContactSelectionAdapter contactAdapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        if (savedInstanceState != null) {
            draftTitle = savedInstanceState.getString("draft_title", "");
            draftSource = savedInstanceState.getString("draft_source", "");
            draftRendered = savedInstanceState.getString("draft_rendered", "");
            draftTemplate = savedInstanceState.getInt("draft_template", SmsTemplates.UNIVERSAL);
            choosingContacts = savedInstanceState.getBoolean("choosing_contacts", false);
        }

        BulkCampaignStore.Campaign active = BulkCampaignStore.active(this);
        if (active != null && !active.paused) {
            showQueue();
        } else if (choosingContacts && !draftRendered.isEmpty()) {
            showContactSelection();
        } else {
            showDashboard();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        BulkCampaignStore.Campaign active = BulkCampaignStore.active(this);
        if (active != null && !active.paused && active.current() != null
                && BulkCampaignStore.STATUS_OPENED.equals(active.current().status)) {
            showQueue();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString("draft_title", draftTitle);
        outState.putString("draft_source", draftSource);
        outState.putString("draft_rendered", draftRendered);
        outState.putInt("draft_template", draftTemplate);
        outState.putBoolean("choosing_contacts", choosingContacts);
    }

    private void showDashboard() {
        choosingContacts = false;
        LinearLayout root = baseRoot("Рассылки", true);
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = pageBox();
        scroll.addView(box);

        BulkCampaignStore.Campaign active = BulkCampaignStore.active(this);
        if (active != null) {
            box.addView(sectionTitle("Текущая рассылка"));
            LinearLayout card = card();
            card.addView(title(active.title));
            card.addView(body(progressText(active)), topMargin(6));
            card.addView(small(active.paused ? "Пауза. Можно продолжить с того же контакта." : "Рассылка активна."), topMargin(5));

            Button resume = primaryButton(active.paused ? "ПРОДОЛЖИТЬ" : "ОТКРЫТЬ ОЧЕРЕДЬ");
            resume.setOnClickListener(v -> {
                active.paused = false;
                BulkCampaignStore.saveActive(this, active);
                showQueue();
            });
            card.addView(resume, topMargin(12));

            Button cancel = secondaryButton("Отменить рассылку");
            cancel.setOnClickListener(v -> confirmCancel(active));
            card.addView(cancel, topMargin(8));
            box.addView(card);
        } else {
            box.addView(sectionTitle("Новая рассылка"));
            LinearLayout intro = card();
            intro.addView(body("Выберите текст и контакты. Затем приложение будет по одному открывать стандартное SMS-приложение для каждого адресата. Автоматической скрытой отправки нет."));
            Button create = primaryButton("СОЗДАТЬ РАССЫЛКУ");
            create.setOnClickListener(v -> showMessageSetup());
            intro.addView(create, topMargin(12));
            box.addView(intro);
        }

        box.addView(sectionTitle("История рассылок"), topMargin(24));
        List<BulkCampaignStore.Summary> history = BulkCampaignStore.history(this);
        if (history.isEmpty()) {
            LinearLayout empty = card();
            empty.addView(body("Пока нет завершённых или отменённых рассылок."));
            box.addView(empty);
        } else {
            SimpleDateFormat format = new SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault());
            for (BulkCampaignStore.Summary item : history) {
                LinearLayout row = card();
                row.addView(title(item.title));
                String state = item.cancelled ? "Отменена" : "Завершена";
                row.addView(small(state + " • " + format.format(new Date(item.finishedAt))), topMargin(4));
                row.addView(body("Всего: " + item.total + " • подготовлено: " + item.prepared + " • пропущено: " + item.skipped), topMargin(6));
                box.addView(row, topMargin(10));
            }

            Button clear = secondaryButton("Очистить историю рассылок");
            clear.setOnClickListener(v -> new AlertDialog.Builder(this)
                    .setTitle("Очистить историю?")
                    .setMessage("Текущая активная рассылка не будет удалена.")
                    .setPositiveButton("Очистить", (d, w) -> {
                        BulkCampaignStore.clearHistory(this);
                        showDashboard();
                    })
                    .setNegativeButton("Отмена", null)
                    .show());
            box.addView(clear, topMargin(16));
        }

        box.addView(small("Контакты используются только локально на смартфоне. Имя контакта показывается для выбора адресата, но автоматически в текст SMS не вставляется."), topMargin(18));

        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void showMessageSetup() {
        choosingContacts = false;
        LinearLayout root = baseRoot("Новая рассылка", false);
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = pageBox();
        scroll.addView(box);

        box.addView(sectionTitle("1. Текст сообщения"));

        EditText campaignTitle = edit("Название рассылки", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        if (draftTitle.isEmpty()) {
            draftTitle = "Рассылка " + new SimpleDateFormat("dd.MM HH:mm", Locale.getDefault()).format(new Date());
        }
        campaignTitle.setText(draftTitle);
        box.addView(campaignTitle);

        box.addView(label("Взять за основу шаблон"), topMargin(14));
        Spinner templates = new Spinner(this);
        templates.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, SmsTemplates.NAMES));
        templates.setSelection(draftTemplate);
        box.addView(templates, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));

        EditText editor = multiLineEdit("Текст рассылки", 220);
        if (draftSource.isEmpty()) draftSource = AppPrefs.smsTemplate(this, draftTemplate);
        editor.setText(draftSource);
        editor.setSelection(editor.length());
        box.addView(editor, topMargin(8));

        LinearLayout previewCard = card();
        previewCard.addView(label("Предпросмотр для каждого получателя"));
        TextView preview = body("");
        preview.setTextColor(BLACK);
        preview.setTextSize(15);
        TextView count = small("");
        previewCard.addView(preview, topMargin(8));
        previewCard.addView(count, topMargin(8));
        box.addView(previewCard, topMargin(12));

        Runnable update = () -> {
            draftTitle = campaignTitle.getText().toString().trim();
            draftTemplate = templates.getSelectedItemPosition();
            draftSource = editor.getText().toString();
            draftRendered = SmsTemplates.render(this, draftSource, "");
            preview.setText(draftRendered.isEmpty() ? "Сообщение пустое" : draftRendered);
            count.setText(SmsLength.calculate(draftRendered).label());
        };
        update.run();

        campaignTitle.addTextChangedListener(new SimpleTextWatcher(update));
        editor.addTextChangedListener(new SimpleTextWatcher(update));
        templates.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            boolean first = true;
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                if (first) {
                    first = false;
                    update.run();
                    return;
                }
                draftTemplate = position;
                draftSource = AppPrefs.smsTemplate(BulkCampaignActivity.this, position);
                editor.setText(draftSource);
                editor.setSelection(editor.length());
                update.run();
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
        });

        box.addView(small("Важно: {client_name} в массовой рассылке не берётся из телефонной книги. Если переменная присутствует в строке, эта строка будет удалена из итогового текста."), topMargin(10));

        Button next = primaryButton("ДАЛЕЕ — ВЫБРАТЬ ПОЛУЧАТЕЛЕЙ");
        next.setOnClickListener(v -> {
            update.run();
            if (draftRendered.trim().isEmpty()) {
                Toast.makeText(this, "Текст рассылки пустой", Toast.LENGTH_LONG).show();
                return;
            }
            choosingContacts = true;
            showContactSelection();
        });
        box.addView(next, topMargin(16));

        Button cancel = secondaryButton("Отмена");
        cancel.setOnClickListener(v -> {
            clearDraft();
            showDashboard();
        });
        box.addView(cancel, topMargin(8));

        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void showContactSelection() {
        choosingContacts = true;
        if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, REQUEST_CONTACTS);
            return;
        }

        LinearLayout root = baseRoot("Получатели", false);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(dp(14), dp(12), dp(14), dp(8));
        controls.setBackgroundColor(SURFACE);

        TextView subtitle = title("2. Выберите контакты");
        controls.addView(subtitle);
        TextView status = small("Загрузка телефонной книги…");
        controls.addView(status, topMargin(4));

        EditText search = edit("Поиск по имени или номеру", InputType.TYPE_CLASS_TEXT);
        controls.addView(search, topMargin(10));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button selectAll = compactButton("Выбрать найденных");
        Button clear = compactButton("Снять выбор");
        actions.addView(selectAll, new LinearLayout.LayoutParams(0, dp(44), 1f));
        LinearLayout.LayoutParams clearLp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        clearLp.leftMargin = dp(8);
        actions.addView(clear, clearLp);
        controls.addView(actions, topMargin(8));
        root.addView(controls);

        ListView list = new ListView(this);
        list.setDividerHeight(1);
        list.setBackgroundColor(Color.WHITE);
        root.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(dp(14), dp(10), dp(14), dp(14));
        bottom.setBackgroundColor(Color.WHITE);
        TextView selectedText = label("Выбрано: 0");
        bottom.addView(selectedText);

        Button create = primaryButton("СОЗДАТЬ ОЧЕРЕДЬ");
        bottom.addView(create, topMargin(8));
        Button back = secondaryButton("← Назад к тексту");
        bottom.addView(back, topMargin(7));
        root.addView(bottom);

        setContentView(root);

        new Thread(() -> {
            List<ContactRepository.Item> contacts = ContactRepository.load(this);
            runOnUiThread(() -> {
                contactAdapter = new ContactSelectionAdapter(contacts, () -> {
                    selectedText.setText("Выбрано: " + contactAdapter.selectedCount());
                    status.setText("Найдено: " + contactAdapter.visibleCount() + " • всего уникальных номеров: " + contactAdapter.totalCount());
                });
                list.setAdapter(contactAdapter);
                status.setText("Найдено: " + contacts.size() + " уникальных номеров");
                selectedText.setText("Выбрано: 0");
            });
        }).start();

        search.addTextChangedListener(new SimpleTextWatcher(() -> {
            if (contactAdapter != null) contactAdapter.filter(search.getText().toString());
        }));
        selectAll.setOnClickListener(v -> {
            if (contactAdapter != null) contactAdapter.selectVisible();
        });
        clear.setOnClickListener(v -> {
            if (contactAdapter != null) contactAdapter.clearSelection();
        });
        back.setOnClickListener(v -> {
            choosingContacts = false;
            showMessageSetup();
        });
        create.setOnClickListener(v -> {
            if (contactAdapter == null) {
                Toast.makeText(this, "Телефонная книга ещё загружается", Toast.LENGTH_SHORT).show();
                return;
            }
            List<ContactRepository.Item> selected = contactAdapter.selectedItems();
            if (selected.isEmpty()) {
                Toast.makeText(this, "Выберите хотя бы одного получателя", Toast.LENGTH_LONG).show();
                return;
            }
            new AlertDialog.Builder(this)
                    .setTitle("Создать рассылку?")
                    .setMessage("Получателей: " + selected.size() + "\n\nПриложение будет открывать SMS по одному. Отправку каждого сообщения вы подтверждаете в стандартном приложении сообщений.")
                    .setPositiveButton("Создать", (d, w) -> {
                        BulkCampaignStore.Campaign campaign = BulkCampaignStore.Campaign.create(draftTitle, draftRendered, selected);
                        BulkCampaignStore.saveActive(this, campaign);
                        clearDraft();
                        showQueue();
                    })
                    .setNegativeButton("Отмена", null)
                    .show();
        });
    }

    private void showQueue() {
        choosingContacts = false;
        BulkCampaignStore.Campaign campaign = BulkCampaignStore.active(this);
        if (campaign == null) {
            showDashboard();
            return;
        }
        campaign.paused = false;
        campaign.advanceIndex();
        if (campaign.complete()) {
            BulkCampaignStore.finish(this, campaign, false);
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
            return;
        }
        BulkCampaignStore.saveActive(this, campaign);

        BulkCampaignStore.Recipient recipient = campaign.current();
        LinearLayout root = baseRoot("Очередь рассылки", false);
        ScrollView scroll = new ScrollView(this);
        LinearLayout box = pageBox();
        scroll.addView(box);

        box.addView(sectionTitle(campaign.title));
        LinearLayout progress = card();
        progress.addView(label("Прогресс"));
        progress.addView(body(progressText(campaign)), topMargin(6));
        progress.addView(small("Подготовлено: " + campaign.preparedCount() + " • пропущено: " + campaign.skippedCount()), topMargin(5));
        box.addView(progress);

        box.addView(sectionTitle("Текущий получатель"), topMargin(18));
        LinearLayout person = card();
        person.addView(title(recipient.name.isEmpty() ? PhoneNormalizer.display(recipient.phone) : recipient.name));
        person.addView(body(PhoneNormalizer.display(recipient.phone)), topMargin(5));
        int position = Math.min(campaign.currentIndex + 1, campaign.totalCount());
        person.addView(small("Контакт " + position + " из " + campaign.totalCount()), topMargin(5));
        box.addView(person);

        box.addView(sectionTitle("Сообщение"), topMargin(18));
        LinearLayout message = card();
        TextView messageText = body(campaign.message);
        messageText.setTextColor(BLACK);
        messageText.setTextSize(15);
        message.addView(messageText);
        message.addView(small(SmsLength.calculate(campaign.message).label()), topMargin(8));
        box.addView(message);

        if (BulkCampaignStore.STATUS_OPENED.equals(recipient.status)) {
            LinearLayout confirm = card();
            TextView note = body("SMS-приложение уже открывалось для этого контакта. Android не сообщает нам, было ли сообщение действительно отправлено, поэтому отметьте результат вручную.");
            note.setTextColor(Color.rgb(151, 88, 0));
            confirm.addView(note);

            Button done = primaryButton("ГОТОВО — СЛЕДУЮЩИЙ");
            done.setOnClickListener(v -> markPreparedAndNext(campaign, recipient));
            confirm.addView(done, topMargin(12));

            Button reopen = secondaryButton("Открыть SMS ещё раз");
            reopen.setOnClickListener(v -> openCampaignSms(campaign, recipient));
            confirm.addView(reopen, topMargin(8));

            Button skip = secondaryButton("Пропустить этого получателя");
            skip.setOnClickListener(v -> skipAndNext(campaign, recipient));
            confirm.addView(skip, topMargin(8));
            box.addView(confirm, topMargin(14));
        } else {
            Button open = primaryButton("ОТКРЫТЬ SMS");
            open.setOnClickListener(v -> openCampaignSms(campaign, recipient));
            box.addView(open, topMargin(16));

            Button skip = secondaryButton("Пропустить получателя");
            skip.setOnClickListener(v -> skipAndNext(campaign, recipient));
            box.addView(skip, topMargin(8));
        }

        Button pause = secondaryButton("Пауза и выйти из очереди");
        pause.setOnClickListener(v -> {
            campaign.paused = true;
            BulkCampaignStore.saveActive(this, campaign);
            showDashboard();
        });
        box.addView(pause, topMargin(16));

        Button cancel = secondaryButton("Отменить всю рассылку");
        cancel.setOnClickListener(v -> confirmCancel(campaign));
        box.addView(cancel, topMargin(8));

        box.addView(small("Статус «Подготовлено» означает, что вы вручную подтвердили обработку контакта после открытия SMS. Приложение не читает содержимое системного приложения сообщений и не может подтвердить доставку."), topMargin(16));

        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void openCampaignSms(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        recipient.status = BulkCampaignStore.STATUS_OPENED;
        BulkCampaignStore.saveActive(this, campaign);

        Intent intent = new Intent(this, SmsComposeActivity.class)
                .putExtra("number", recipient.phone)
                .putExtra("call_type", "bulk")
                .putExtra("body_override", campaign.message)
                .putExtra("history_template", campaign.title)
                .putExtra("skip_history", true);
        startActivity(intent);
    }

    private void markPreparedAndNext(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        recipient.status = BulkCampaignStore.STATUS_PREPARED;
        HistoryStore.add(this, recipient.phone, "bulk", campaign.title);
        campaign.currentIndex++;
        campaign.advanceIndex();
        if (campaign.complete()) {
            BulkCampaignStore.finish(this, campaign, false);
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
        } else {
            BulkCampaignStore.saveActive(this, campaign);
            showQueue();
        }
    }

    private void skipAndNext(BulkCampaignStore.Campaign campaign, BulkCampaignStore.Recipient recipient) {
        recipient.status = BulkCampaignStore.STATUS_SKIPPED;
        campaign.currentIndex++;
        campaign.advanceIndex();
        if (campaign.complete()) {
            BulkCampaignStore.finish(this, campaign, false);
            Toast.makeText(this, "Рассылка завершена", Toast.LENGTH_LONG).show();
            showDashboard();
        } else {
            BulkCampaignStore.saveActive(this, campaign);
            showQueue();
        }
    }

    private void confirmCancel(BulkCampaignStore.Campaign campaign) {
        new AlertDialog.Builder(this)
                .setTitle("Отменить рассылку?")
                .setMessage("Прогресс будет сохранён в истории как отменённая рассылка. Продолжить её после отмены будет нельзя.")
                .setPositiveButton("Отменить рассылку", (d, w) -> {
                    BulkCampaignStore.finish(this, campaign, true);
                    showDashboard();
                })
                .setNegativeButton("Назад", null)
                .show();
    }

    private String progressText(BulkCampaignStore.Campaign campaign) {
        int processed = campaign.processedCount();
        return processed + " из " + campaign.totalCount() + " обработано • осталось " + Math.max(0, campaign.totalCount() - processed);
    }

    private void clearDraft() {
        draftTitle = "";
        draftSource = "";
        draftRendered = "";
        draftTemplate = SmsTemplates.UNIVERSAL;
        choosingContacts = false;
        contactAdapter = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CONTACTS) {
            if (checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
                showContactSelection();
            } else {
                Toast.makeText(this, "Без доступа к контактам нельзя выбрать получателей рассылки", Toast.LENGTH_LONG).show();
                choosingContacts = false;
                showMessageSetup();
            }
        }
    }

    private LinearLayout baseRoot(String titleText, boolean closeToMain) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(SURFACE);
        root.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(12), dp(10), dp(12), dp(10));
        header.setBackgroundColor(RED);

        Button back = new Button(this);
        back.setText("‹");
        back.setTextSize(28);
        back.setTextColor(Color.WHITE);
        back.setAllCaps(false);
        back.setBackgroundColor(Color.TRANSPARENT);
        back.setStateListAnimator(null);
        back.setOnClickListener(v -> {
            if (closeToMain) finish();
            else showDashboard();
        });
        header.addView(back, new LinearLayout.LayoutParams(dp(48), dp(48)));

        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextColor(Color.WHITE);
        title.setTextSize(19);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER_VERTICAL);
        header.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1f));
        root.addView(header);
        return root;
    }

    private LinearLayout pageBox() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(16), dp(16), dp(28));
        box.setLayoutParams(new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return box;
    }

    private LinearLayout card() {
        LinearLayout v = new LinearLayout(this);
        v.setOrientation(LinearLayout.VERTICAL);
        v.setPadding(dp(16), dp(14), dp(16), dp(14));
        v.setBackground(roundRect(Color.WHITE, 14, BORDER));
        v.setElevation(dp(1));
        return v;
    }

    private TextView sectionTitle(String text) {
        TextView t = title(text);
        t.setTextSize(20);
        LinearLayout.LayoutParams lp = topMargin(14);
        lp.bottomMargin = dp(10);
        t.setLayoutParams(lp);
        return t;
    }

    private TextView title(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(BLACK);
        t.setTextSize(17);
        t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private TextView label(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(BLACK);
        t.setTextSize(14);
        t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }

    private TextView body(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(MUTED);
        t.setTextSize(14);
        t.setLineSpacing(0, 1.12f);
        return t;
    }

    private TextView small(String text) {
        TextView t = body(text);
        t.setTextSize(12);
        return t;
    }

    private EditText edit(String hint, int inputType) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextSize(16);
        e.setTextColor(BLACK);
        e.setHintTextColor(Color.rgb(145, 145, 145));
        e.setSingleLine(true);
        e.setInputType(inputType);
        e.setPadding(dp(14), 0, dp(14), 0);
        e.setBackground(roundRect(Color.WHITE, 10, BORDER));
        e.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));
        return e;
    }

    private EditText multiLineEdit(String hint, int heightDp) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextSize(15);
        e.setTextColor(BLACK);
        e.setHintTextColor(Color.rgb(145, 145, 145));
        e.setSingleLine(false);
        e.setGravity(Gravity.TOP | Gravity.START);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        e.setPadding(dp(14), dp(12), dp(14), dp(12));
        e.setBackground(roundRect(Color.WHITE, 10, BORDER));
        e.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(heightDp)));
        return e;
    }

    private Button primaryButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setGravity(Gravity.CENTER);
        b.setStateListAnimator(null);
        b.setBackground(roundRect(RED, 11, 0));
        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));
        return b;
    }

    private Button secondaryButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(BLACK);
        b.setTextSize(14);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setGravity(Gravity.CENTER);
        b.setStateListAnimator(null);
        b.setBackground(roundRect(Color.WHITE, 11, BORDER));
        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        return b;
    }

    private Button compactButton(String text) {
        Button b = secondaryButton(text);
        b.setTextSize(12);
        return b;
    }

    private GradientDrawable roundRect(int color, int radiusDp, int strokeColor) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        if (strokeColor != 0) d.setStroke(dp(1), strokeColor);
        return d;
    }

    private LinearLayout.LayoutParams topMargin(int value) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(value);
        return lp;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class ContactSelectionAdapter extends BaseAdapter {
        private final List<ContactRepository.Item> all;
        private final List<ContactRepository.Item> visible = new ArrayList<>();
        private final Set<String> selected = new LinkedHashSet<>();
        private final Runnable changed;

        ContactSelectionAdapter(List<ContactRepository.Item> contacts, Runnable changed) {
            this.all = contacts == null ? new ArrayList<>() : new ArrayList<>(contacts);
            this.visible.addAll(this.all);
            this.changed = changed;
        }

        void filter(String query) {
            visible.clear();
            for (ContactRepository.Item item : all) if (item.matches(query)) visible.add(item);
            notifyDataSetChanged();
            changed.run();
        }

        void selectVisible() {
            for (ContactRepository.Item item : visible) selected.add(item.phone);
            notifyDataSetChanged();
            changed.run();
        }

        void clearSelection() {
            selected.clear();
            notifyDataSetChanged();
            changed.run();
        }

        int selectedCount() { return selected.size(); }
        int visibleCount() { return visible.size(); }
        int totalCount() { return all.size(); }

        List<ContactRepository.Item> selectedItems() {
            ArrayList<ContactRepository.Item> result = new ArrayList<>();
            for (ContactRepository.Item item : all) if (selected.contains(item.phone)) result.add(item);
            return result;
        }

        @Override public int getCount() { return visible.size(); }
        @Override public Object getItem(int position) { return visible.get(position); }
        @Override public long getItemId(int position) { return position; }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            CheckBox checkBox;
            if (convertView instanceof CheckBox) {
                checkBox = (CheckBox) convertView;
            } else {
                checkBox = new CheckBox(BulkCampaignActivity.this);
                checkBox.setTextColor(BLACK);
                checkBox.setTextSize(15);
                checkBox.setGravity(Gravity.CENTER_VERTICAL);
                checkBox.setPadding(dp(14), dp(8), dp(14), dp(8));
                checkBox.setMinHeight(dp(58));
            }

            ContactRepository.Item item = visible.get(position);
            checkBox.setOnCheckedChangeListener(null);
            checkBox.setText(item.name + "\n" + PhoneNormalizer.display(item.phone));
            checkBox.setChecked(selected.contains(item.phone));
            checkBox.setOnCheckedChangeListener((buttonView, isChecked) -> {
                if (isChecked) selected.add(item.phone); else selected.remove(item.phone);
                changed.run();
            });
            return checkBox;
        }
    }

    private static final class SimpleTextWatcher implements TextWatcher {
        private final Runnable runnable;
        SimpleTextWatcher(Runnable runnable) { this.runnable = runnable; }
        @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
        @Override public void onTextChanged(CharSequence s, int start, int before, int count) { runnable.run(); }
        @Override public void afterTextChanged(Editable s) {}
    }
}
