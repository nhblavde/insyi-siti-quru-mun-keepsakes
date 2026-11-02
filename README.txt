# Our Keepsakes — setup guide

This package contains:
- `index.html` — the single-page website. The navigation switches between Home, About Us, Our Memories, My Wish and Leave a Message without loading separate HTML files.
- `Code.gs` — Google Apps Script backend.
- `README.txt` — deployment instructions and important access notes.

## 1. Create the Google backend

1. Sign in to the Google account that should own the scrapbook data.
2. Open [Google Apps Script](https://script.google.com/).
3. Create a **New project**.
4. Replace the starter code in `Code.gs` with the contents of the supplied `Code.gs`.
5. Save the project.
6. In the function dropdown, select `setupKeepsakes` and click **Run**.
7. Google will request permission to manage the Drive folder and spreadsheet. Review and authorize it.
8. Open **Execution log**. The setup function logs the Drive folder and spreadsheet URLs. The script also stores their IDs in Script Properties.

The script creates:
- A Google Drive folder called **Our Keepsakes Uploads** for profile and memory photos.
- A Google Spreadsheet called **Keepsakes Data**, with a `Records` tab for messages and photo metadata.

## 2. Deploy as a Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Select the gear icon and choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone** (or the broadest access option available in your Google account).
5. Click **Deploy** and complete any authorization prompts.
6. Copy the Web app URL. It must end in `/exec`.

If your Google Workspace account does not allow public Web Apps, use a personal Google account or adjust the account's Apps Script deployment policy.

## 3. Connect the website

1. Open `index.html` in a text editor.
2. Find:
   `const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL';`
3. Replace the placeholder with your deployed `/exec` URL, keeping the quotation marks. Example format:
   `const API_URL = 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec';`
4. Save `index.html`.

## 4. Publish on GitHub Pages

1. Create a GitHub repository (for example, `our-keepsakes`).
2. Upload `index.html` to the repository root.
3. Open the repository's **Settings → Pages**.
4. Under Build and deployment, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.
6. Wait for GitHub Pages to publish the site. Use the published URL to share it with your friends.

You can test `index.html` locally first, but shared uploads and messages only work after the Apps Script URL has been configured and deployed.

## 5. How the shared features work

- Profile photos are uploaded to Google Drive and displayed for everyone.
- Memory photos are uploaded to Google Drive and displayed in the shared gallery.
- Guestbook messages are stored in the Google Sheet.
- The website refreshes shared data every 30 seconds.
- Images are resized in the browser before upload (maximum 1600 px on the longest side and approximately 4 MB).

## Important access and privacy note

This implementation is designed as a **shared, public scrapbook**, not a private or authenticated application. Anyone who can access the site and its backend can add messages, edit or delete messages, upload photos, and remove photos. Anyone can also view uploaded photos because the script makes them viewable to anyone with the link.

Do not upload confidential or sensitive images or personal information. The delete buttons affect the shared collection for everyone. Keep a backup of the Google Sheet and Drive folder if the content matters.

The current setup does not provide per-person ownership or administrator-only deletion. Adding that safely requires an authentication layer (for example, Google sign-in with server-side identity verification).
