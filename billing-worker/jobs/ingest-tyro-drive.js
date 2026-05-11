'use strict';

const drive = require('../services/drive');
const { ingestTyroCsv } = require('./ingest-tyro');
const { logger } = require('../lib/logger');

const TYRO_FOLDER_ID = process.env.TYRO_DRIVE_FOLDER_ID || '1Ge42fytNPrABNNaWY0QfT_eDtEJ9AAdW';
const PROCESSED_FOLDER_NAME = 'processed';

async function ingestTyroFromDrive(log = logger) {
  if (!TYRO_FOLDER_ID) throw new Error('TYRO_DRIVE_FOLDER_ID not configured');

  const files = await drive.listCsvFiles(TYRO_FOLDER_ID);
  if (files.length === 0) {
    log.info('No new Tyro CSV files in Drive folder');
    return { files: 0, results: [] };
  }

  const processedId = await drive.findOrCreateSubfolder(TYRO_FOLDER_ID, PROCESSED_FOLDER_NAME);
  const results = [];

  for (const file of files) {
    try {
      log.info({ fileId: file.id, fileName: file.name }, 'Ingesting Tyro CSV from Drive');
      const csvText = await drive.downloadFile(file.id);
      const result = await ingestTyroCsv(csvText, log);
      await drive.moveFile(file.id, TYRO_FOLDER_ID, processedId);
      results.push({ file: file.name, ok: true, ...result });
    } catch (err) {
      log.error({ fileId: file.id, fileName: file.name, err: err.message }, 'Drive Tyro ingest failed');
      results.push({ file: file.name, ok: false, error: err.message });
    }
  }

  return { files: files.length, results };
}

module.exports = { ingestTyroFromDrive };
