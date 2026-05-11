'use strict';

const { google } = require('googleapis');

let _drive = null;

async function getDrive() {
  if (_drive) return _drive;
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

async function listCsvFiles(folderId) {
  const drive = await getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and (mimeType='text/csv' or name contains '.csv')`,
    fields: 'files(id, name, mimeType, modifiedTime, parents)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 100,
  });
  return (res.data.files || []).filter((f) => f.name.toLowerCase().endsWith('.csv'));
}

async function downloadFile(fileId) {
  const drive = await getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' }
  );
  return res.data;
}

async function findOrCreateSubfolder(parentFolderId, name) {
  const drive = await getDrive();
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id;
}

async function moveFile(fileId, fromFolderId, toFolderId) {
  const drive = await getDrive();
  await drive.files.update({
    fileId,
    addParents: toFolderId,
    removeParents: fromFolderId,
    supportsAllDrives: true,
    fields: 'id, parents',
  });
}

module.exports = { getDrive, listCsvFiles, downloadFile, findOrCreateSubfolder, moveFile };
