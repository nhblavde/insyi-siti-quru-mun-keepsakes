/**
 * OUR KEEPSAKES — Google Apps Script backend
 *
 * Run setupKeepsakes() once from the Apps Script editor.
 * It creates a Google Drive folder and a Google Sheet for metadata/messages.
 *
 * IMPORTANT: This is a public shared scrapbook. Anyone who can access the
 * website can add, edit, and delete messages/photos. Do not store private data.
 */

const CONFIG = {
  SHEET_NAME: 'Keepsakes Data',
  FOLDER_NAME: 'Our Keepsakes Uploads',
  MAX_IMAGE_BYTES: 4 * 1024 * 1024,
  ALLOWED_PROFILE_KEYS: ['insyi', 'siti', 'quru', 'mun']
};

function setupKeepsakes() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('FOLDER_ID');
  let sheetId = props.getProperty('SHEET_ID');

  let folder;
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); } catch (e) {}
  }
  if (!folder) {
    folder = DriveApp.createFolder(CONFIG.FOLDER_NAME);
    props.setProperty('FOLDER_ID', folder.getId());
  }

  let ss;
  if (sheetId) {
    try { ss = SpreadsheetApp.openById(sheetId); } catch (e) {}
  }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.SHEET_NAME);
    props.setProperty('SHEET_ID', ss.getId());
  }

  let sheet = ss.getSheetByName('Records');
  if (!sheet) sheet = ss.insertSheet('Records');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['type', 'id', 'json', 'updatedAt']);
    sheet.setFrozenRows(1);
  }

  Logger.log('Setup complete.');
  Logger.log('Drive folder: ' + folder.getUrl());
  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Folder ID: ' + folder.getId());
  Logger.log('Spreadsheet ID: ' + ss.getId());
  return {folderUrl: folder.getUrl(), spreadsheetUrl: ss.getUrl()};
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = params.action || 'list';
  if (action !== 'list') return jsonOutput_({ok:false, error:'Unsupported GET action.'});
  try {
    const data = readAll_();
    const payload = JSON.stringify({ok:true, messages:data.messages, photos:data.photos, profiles:data.profiles});
    const callback = params.callback;
    if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
      return ContentService.createTextOutput(callback + '(' + payload + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOutput_({ok:true, messages:data.messages, photos:data.photos, profiles:data.profiles});
  } catch (err) {
    const result = {ok:false, error:String(err && err.message || err)};
    if (params.callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(params.callback)) {
      return ContentService.createTextOutput(params.callback + '(' + JSON.stringify(result) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOutput_(result);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const raw = e && e.parameter && e.parameter.payload;
    if (!raw) throw new Error('Missing request payload.');
    const payload = JSON.parse(raw);
    const result = handleAction_(payload);
    return jsonOutput_({ok:true, result:result});
  } catch (err) {
    return jsonOutput_({ok:false, error:String(err && err.message || err)});
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function handleAction_(p) {
  if (!p || !p.action) throw new Error('Missing action.');
  switch (p.action) {
    case 'uploadMemory': return uploadImage_(p, 'photo');
    case 'uploadProfile':
      if (CONFIG.ALLOWED_PROFILE_KEYS.indexOf(p.key) === -1) throw new Error('Invalid profile key.');
      return uploadImage_(p, 'profile', p.key);
    case 'deleteMemory': return deletePhoto_(p.id);
    case 'deleteProfile':
      if (CONFIG.ALLOWED_PROFILE_KEYS.indexOf(p.key) === -1) throw new Error('Invalid profile key.');
      return deleteProfile_(p.key);
    case 'addMessage': return addMessage_(p);
    case 'updateMessage': return updateMessage_(p);
    case 'deleteMessage': return deleteMessage_(p.id);
    default: throw new Error('Unknown action.');
  }
}

function uploadImage_(p, type, key) {
  if (!p.base64 || !p.mimeType) throw new Error('Image data is missing.');
  const bytes = Utilities.base64Decode(p.base64);
  if (bytes.length > CONFIG.MAX_IMAGE_BYTES) throw new Error('Image exceeds the 4 MB upload limit.');
  const mime = String(p.mimeType);
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') throw new Error('Unsupported image format.');
  const folder = getFolder_();
  const blob = Utilities.newBlob(bytes, mime, safeFileName_(p.name || (key || 'keepsake') + '.jpg'));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const record = {
    id: Utilities.getUuid(),
    key: key || '',
    name: safeText_(p.name || (key ? key + ' profile' : 'A little memory'), 120),
    fileId: file.getId(),
    url: 'https://drive.google.com/uc?export=view&id=' + file.getId(),
    createdAt: new Date().toISOString()
  };

  if (type === 'photo') {
    appendRecord_('photo', record.id, record);
  } else {
    const existing = findRecord_('profile', key);
    if (existing) {
      trashDriveFile_(existing.fileId);
      deleteRecord_('profile', key);
    }
    appendRecord_('profile', key, record);
  }
  return record;
}

function deletePhoto_(id) {
  if (!id) throw new Error('Missing photo ID.');
  const item = findRecord_('photo', id);
  if (!item) throw new Error('Photo was not found.');
  trashDriveFile_(item.fileId);
  deleteRecord_('photo', id);
  return {deleted:true};
}

function deleteProfile_(key) {
  const item = findRecord_('profile', key);
  if (item) trashDriveFile_(item.fileId);
  deleteRecord_('profile', key);
  return {deleted:true};
}

function addMessage_(p) {
  const name = safeText_(p.name, 50);
  const message = safeText_(p.message, 1000);
  if (!name || !message) throw new Error('Name and message are required.');
  const record = {id:Utilities.getUuid(), name:name, message:message, createdAt:new Date().toISOString()};
  appendRecord_('message', record.id, record);
  return record;
}

function updateMessage_(p) {
  if (!p.id) throw new Error('Missing message ID.');
  const item = findRecord_('message', p.id);
  if (!item) throw new Error('Message was not found.');
  item.name = safeText_(p.name, 50);
  item.message = safeText_(p.message, 1000);
  if (!item.name || !item.message) throw new Error('Name and message are required.');
  item.updatedAt = new Date().toISOString();
  updateRecord_('message', p.id, item);
  return item;
}

function deleteMessage_(id) {
  if (!id) throw new Error('Missing message ID.');
  deleteRecord_('message', id);
  return {deleted:true};
}

function readAll_() {
  const rows = getSheet_().getDataRange().getValues();
  const result = {messages:[], photos:[], profiles:{}};
  for (let i = 1; i < rows.length; i++) {
    const type = rows[i][0], id = String(rows[i][1]), raw = rows[i][2];
    if (!raw) continue;
    let item;
    try { item = JSON.parse(raw); } catch (e) { continue; }
    if (type === 'message') result.messages.push(item);
    if (type === 'photo') result.photos.push(item);
    if (type === 'profile') result.profiles[id] = item;
  }
  result.messages.sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  result.photos.sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return result;
}

function appendRecord_(type, id, item) {
  getSheet_().appendRow([type, id, JSON.stringify(item), new Date().toISOString()]);
}
function findRecord_(type, id) {
  const sheet = getSheet_(), values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === type && String(values[i][1]) === String(id)) {
      try { return JSON.parse(values[i][2]); } catch (e) { return null; }
    }
  }
  return null;
}
function updateRecord_(type, id, item) {
  const sheet = getSheet_(), values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === type && String(values[i][1]) === String(id)) {
      sheet.getRange(i + 1, 3, 1, 2).setValues([[JSON.stringify(item), new Date().toISOString()]]);
      return;
    }
  }
  throw new Error('Record not found.');
}
function deleteRecord_(type, id) {
  const sheet = getSheet_(), values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === type && String(values[i][1]) === String(id)) sheet.deleteRow(i + 1);
  }
}
function getSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setupKeepsakes() once in the Apps Script editor before deploying.');
  return SpreadsheetApp.openById(id).getSheetByName('Records');
}
function getFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw new Error('Run setupKeepsakes() once in the Apps Script editor before deploying.');
  return DriveApp.getFolderById(id);
}
function trashDriveFile_(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
}
function safeText_(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}
function safeFileName_(value) {
  return safeText_(value, 100).replace(/[\\\/:*?"<>|]/g, '_') || 'keepsake.jpg';
}
function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
