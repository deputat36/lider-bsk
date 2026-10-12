from pathlib import Path

src=Path("android/build-src/sms-card-app/app/src/main/java/ru/etagi/borisoglebsk/smscard")
p=src/"MainActivity.java"
s=p.read_text()

old='''        tabs.addView(tabBulk, tabLp);
        tabs.addView(tabSettings, tabLp);
        root.addView(tabs);

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));
'''
new='''        tabs.addView(tabBulk, tabLp);
        tabs.addView(tabSettings, tabLp);

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));
        // Consistent bottom navigation on small screens and large text settings.
        tabs.setElevation(dp(4));
        root.addView(tabs);
'''
assert old in s
s=s.replace(old,new,1)
p.write_text(s)

p=src/"BulkCampaignActivity.java"
s=p.read_text()
old='''            new AlertDialog.Builder(this)
                    .setTitle("Создать рассылку?")
'''
new='''            new AlertDialog.Builder(this)
                    .setTitle("Создать рассылку?")
'''
assert old in s
# Keep existing consent reminder before sending.
p.write_text(s)

p=src/"SmsComposeActivity.java"
s=p.read_text()
needle='''            startActivity(sms);
            SqliteStores.logEvent(this, "sms_composer", "Открыто штатное приложение SMS");
'''
assert needle in s
# Logging doesn't contain a phone number or SMS content.
p.write_text(s)
print("v0.6.0 bottom navigation applied")
