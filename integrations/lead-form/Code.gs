const PARENT_ORIGIN = 'https://a1insulationairdfw.github.io';
const HEADERS = ['Received at', 'Request ID', 'Name', 'Phone', 'Email', 'City', 'Service', 'Preferred time', 'Details', 'UTM source', 'UTM medium', 'UTM campaign', 'Referrer host', 'Landing path', 'Email status', 'Last email error'];
function setupLeadService_() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('SHEET_ID')) {
    const file = SpreadsheetApp.create('A-1 Website Service Requests');
    const sheet = file.getSheets()[0];
    sheet.setName('Requests'); sheet.appendRow(HEADERS); sheet.setFrozenRows(1);
    properties.setProperty('SHEET_ID', file.getId());
  }
  if (!properties.getProperty('TOKEN_SECRET')) properties.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!properties.getProperty('NOTIFY_EMAIL')) properties.setProperty('NOTIFY_EMAIL', 'A1INSULATIONAIRDFW@GMAIL.COM');
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'retryLeadEmails_')) {
    ScriptApp.newTrigger('retryLeadEmails_').timeBased().everyMinutes(10).create();
  }
  return {sheetId: properties.getProperty('SHEET_ID'), notificationEmail: properties.getProperty('NOTIFY_EMAIL')};
}
function signature_(id, issuedAt) {
  const secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  if (!secret) throw new Error('Service is not configured. Please call A-1.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(id + ':' + issuedAt, secret));
}
function doGet(event) {
  const parameters = (event && event.parameter) || {};
  if (parameters.parent_origin !== PARENT_ORIGIN || !/^[a-f0-9]{48}$/.test(parameters.nonce || '')) {
    return HtmlService.createHtmlOutput('Please open the request form from the A-1 website.');
  }
  const id = Utilities.getUuid(); const issuedAt = Date.now();
  const context = {parentOrigin: PARENT_ORIGIN, nonce: parameters.nonce, requestId: id, issuedAt, signature: signature_(id, issuedAt)};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'referrer_host', 'landing_path']) context[key] = String(parameters[key] || '').slice(0, 200);
  const template = HtmlService.createTemplateFromFile('Form');
  template.contextJson = JSON.stringify(context).replace(/</g, '\\u003c');
  return template.evaluate().setTitle('A-1 Service Request').addMetaTag('viewport', 'width=device-width, initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function clean_(value, maximum, required) {
  if (typeof value !== 'string') throw new Error('Please check your request details.');
  const result = value.trim();
  if ((required && !result) || result.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new Error('Please check your request details.');
  return result;
}
function cell_(text) { return /^[=+@-]/.test(text) ? "'" + text : text; }
function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Service is not configured. Please call A-1.');
  return SpreadsheetApp.openById(id).getSheetByName('Requests');
}
function submitServiceRequest(input) {
  if (!input || !input.context || input.website) throw new Error('Unable to submit. Please call A-1.');
  const context = input.context; const age = Date.now() - Number(context.issuedAt);
  if (!/^[a-f0-9-]{36}$/i.test(context.requestId || '') || !Number.isFinite(age) || age < 2000 || age > 2 * 60 * 60 * 1000 || context.signature !== signature_(context.requestId, context.issuedAt)) throw new Error('This form has expired. Reload the page, or call A-1.');
  const fields = {name: clean_(input.name, 100, true), phone: clean_(input.phone, 40, true), email: clean_(input.email, 254, false), city: clean_(input.city, 100, true), service: clean_(input.service, 80, true), preferred: clean_(input.preferred, 200, false), details: clean_(input.details, 2000, true)};
  if (fields.phone.replace(/\D/g, '').length < 10 || fields.phone.replace(/\D/g, '').length > 15 || (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) || !['HVAC repair', 'Winter HVAC inspection', 'New HVAC system estimate', 'Insulation', 'Other'].includes(fields.service)) throw new Error('Please check your phone, email, and service selection.');
  const labels = ['utm_source', 'utm_medium', 'utm_campaign', 'referrer_host', 'landing_path'].map(key => cell_(clean_(context[key] || '', 200, false)));
  const lock = LockService.getScriptLock(); lock.waitLock(10000); let rowNumber;
  try {
    const sheet = sheet_();
    if (sheet.getLastRow() > 1) {
      const match = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).createTextFinder(context.requestId).matchEntireCell(true).findNext();
      if (match) return {saved: true, requestId: context.requestId};
    }
    const properties = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
    const counter = JSON.parse(properties.getProperty('DAILY_REQUESTS') || '{}');
    const count = counter.day === day ? Number(counter.count || 0) : 0;
    if (count >= 100) throw new Error('Online requests are temporarily unavailable. Please call 469-716-3088.');
    sheet.appendRow([new Date(), context.requestId, ...Object.values(fields).map(cell_), ...labels, 'Pending', '']);
    rowNumber = sheet.getLastRow();
    properties.setProperty('DAILY_REQUESTS', JSON.stringify({day, count: count + 1})); SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  try { sendLeadEmail_(rowNumber); } catch (_) {}
  return {saved: true, requestId: context.requestId};
}
function sendLeadEmail_(rowNumber) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = sheet_(); const row = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
    if (row[14] === 'Sent') return;
    const recipient = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
    if (!recipient || MailApp.getRemainingDailyQuota() < 1) throw new Error('Email quota unavailable');
    const body = HEADERS.slice(0, 14).map((header, index) => header + ': ' + row[index]).join('\n') + '\n\nCampaign labels and referrer are visitor-supplied context, not verified GA4 attribution.\nOpen requests: ' + sheet.getParent().getUrl();
    MailApp.sendEmail({to: recipient, subject: 'New A-1 website service request', body});
    sheet.getRange(rowNumber, 15, 1, 2).setValues([['Sent', '']]);
  } catch (error) {
    sheet_().getRange(rowNumber, 15, 1, 2).setValues([['Pending', 'Notification could not be sent; scheduled retry']]); throw error;
  } finally { lock.releaseLock(); }
}
function retryLeadEmails_() {
  const sheet = sheet_(); const lastRow = sheet.getLastRow(); if (lastRow < 2) return;
  const statuses = sheet.getRange(2, 15, lastRow - 1, 1).getValues(); let attempted = 0;
  for (let index = 0; index < statuses.length && attempted < 20; index++) {
    if (statuses[index][0] !== 'Pending') continue; attempted++;
    try { sendLeadEmail_(index + 2); } catch (_) { break; }
  }
}

