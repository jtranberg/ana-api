import os
import time
import pandas as pd
from jinja2 import Template
import win32com.client as win32

# === settings ===
CSV_PATH = "contacts.csv"
HTML_TEMPLATE_PATH = "template.html"   # optional; if missing we use EMAIL_TEMPLATE below
DEFAULT_SUBJECT = "Travel list update"
SEND_MODE = "draft"  # "draft" to review in Drafts, "send" to actually send
SECONDS_BETWEEN_SENDS = 1.0  # gentle pacing

# === inline HTML template (used if template.html isn't found) ===
EMAIL_TEMPLATE = """
<!doctype html>
<html>
  <body style="font-family:Segoe UI,Arial,sans-serif; font-size:14px; color:#222;">
    <p>Hi {{ FirstName | default('there') }},</p>
    <p>Quick update on our travel list:</p>
    <ul>
      <li>Closed testing is live</li>
      <li>Tester count looks good</li>
      <li>Next build ships soon</li>
    </ul>
    {% if Company %}<p>Company: <strong>{{ Company }}</strong></p>{% endif %}
    <p>— Jay</p>
  </body>
</html>
"""

# === load data & template ===
df = pd.read_csv(CSV_PATH).fillna("")

if os.path.isfile(HTML_TEMPLATE_PATH):
    with open(HTML_TEMPLATE_PATH, "r", encoding="utf-8") as f:
        tpl = Template(f.read())
else:
    tpl = Template(EMAIL_TEMPLATE)

# === start Outlook ===
outlook = win32.Dispatch("Outlook.Application")
mapi = outlook.GetNamespace("MAPI")
drafts_folder = mapi.GetDefaultFolder(16)  # olFolderDrafts

def render_html(row_dict):
    return tpl.render(**row_dict)

def add_attachment_if_present(mail, path):
    path = (path or "").strip()
    if path:
        if os.path.isfile(path):
            mail.Attachments.Add(Source=path)
        else:
            print(f"[WARN] Attachment not found: {path}")

def make_and_send_mail(row):
    rowd = row.to_dict()
    to_addr = rowd.get("Email", "").strip()
    if not to_addr:
        print("[SKIP] Missing Email field in row"); return

    subject = (rowd.get("Subject") or DEFAULT_SUBJECT).strip() or DEFAULT_SUBJECT
    html_body = render_html(rowd)

    mail = outlook.CreateItem(0)  # olMailItem
    mail.To = to_addr
    if rowd.get("CC", "").strip():  mail.CC  = rowd["CC"].strip()
    if rowd.get("BCC", "").strip(): mail.BCC = rowd["BCC"].strip()
    mail.Subject = subject
    mail.HTMLBody = html_body

    add_attachment_if_present(mail, rowd.get("Attachment", ""))

    if SEND_MODE == "send":
        mail.Send()
        print(f"[SENT]  {to_addr}")
        time.sleep(SECONDS_BETWEEN_SENDS)
    else:
        mail.Save()
        drafts_folder.Items.Refresh()
        print(f"[DRAFT] {to_addr}")

def main():
    print(f"Rows to process: {len(df)} | Mode: {SEND_MODE}")
    for _, row in df.iterrows():
        make_and_send_mail(row)
    print("Done.")

if __name__ == "__main__":
    main()
