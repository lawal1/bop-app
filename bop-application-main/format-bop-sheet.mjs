import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load GWS token from gws config
import { execSync } from 'node:child_process'

const SHEET_ID = '1HPYhjU-SlTgaCw8aLtqeWki1aft6efddkc0IxCypJGA'
const KOPPOH_FOLDER_ID = '1C44PVOpwIbhkj6fjub1YYhsY0NRw0okM'

// Get token via GWS credentials
async function getGWSToken() {
  const creds = JSON.parse(execSync('gws auth export', { encoding: 'utf8' }).replace(/Using keyring backend:.*\n/, ''))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token failed: ${JSON.stringify(data)}`)
  return data.access_token
}

let token
let authHeader

// Upload logo to Drive and make public
async function uploadLogo() {
  const logoPath = path.join(__dirname, 'koppoh-logo-green.png')
  const logoBytes = fs.readFileSync(logoPath)
  const base64 = logoBytes.toString('base64')

  // Upload via Drive API multipart
  const metadata = JSON.stringify({ name: 'koppoh-logo-bop.png', parents: [KOPPOH_FOLDER_ID] })
  const boundary = 'boundary_koppoh_logo'
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    '',
    base64,
    `--${boundary}--`,
  ].join('\r\n')

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const uploadJson = await uploadRes.json()
  if (!uploadRes.ok) throw new Error(`Logo upload failed: ${JSON.stringify(uploadJson)}`)
  const fileId = uploadJson.id
  console.log('Logo uploaded:', fileId)

  // Make public
  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
  if (!permRes.ok) {
    const e = await permRes.json()
    throw new Error(`Permission set failed: ${JSON.stringify(e)}`)
  }
  console.log('Logo made public')

  return `https://drive.google.com/uc?id=${fileId}`
}

async function formatSheet(logoUrl) {
  // Get sheet info to find sheetId
  const infoRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, { headers: authHeader })
  const info = await infoRes.json()
  const sheetId = info.sheets[0].properties.sheetId

  // Koppoh green #0E821D → {r: 14/255, g: 130/255, b: 29/255}
  const koppohGreen = { red: 0.055, green: 0.510, blue: 0.114 }
  const white = { red: 1, green: 1, blue: 1 }
  const black = { red: 0, green: 0, blue: 0 }
  const lightGrey = { red: 0.96, green: 0.96, blue: 0.96 }

  const headers = [
    'Timestamp', 'Name', 'Email', 'Phone', 'Age Range', 'Country', 'Region',
    'Role', 'Niche', 'Source', 'Portfolio URL', 'Business Stage',
    'Revenue (90 Days)', 'Highest Client Value', 'Booking Frequency',
    'Branch Reason', 'Achievement Goals', 'Time Commitment', 'Payment Readiness',
    'Why Now', 'Six Month Impact', 'Why Bedge',
    'BOP Score', 'Application Status', 'Lead Tier', 'Gap Feedback', 'Next Steps',
  ]

  const requests = [
    // Insert 3 rows at top for logo area
    {
      insertDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 3 },
        inheritFromBefore: false,
      },
    },
    // Set logo row height (rows 0-2, 30px each)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 3 },
        properties: { pixelSize: 30 },
        fields: 'pixelSize',
      },
    },
    // Merge A1:E3 for logo area
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 },
        mergeType: 'MERGE_ALL',
      },
    },
    // Logo cell background white
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 },
        cell: { userEnteredFormat: { backgroundColor: white } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    },
    // Insert IMAGE formula in A1
    {
      updateCells: {
        rows: [{ values: [{ userEnteredValue: { formulaValue: `=IMAGE("${logoUrl}",4,70,200)` } }] }],
        fields: 'userEnteredValue',
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
      },
    },
    // Header row (row 3) — Koppoh green background, white bold Montserrat
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: headers.length },
        cell: {
          userEnteredFormat: {
            backgroundColor: koppohGreen,
            textFormat: { foregroundColor: white, bold: true, fontFamily: 'Montserrat', fontSize: 10 },
            verticalAlignment: 'MIDDLE',
            horizontalAlignment: 'LEFT',
            wrapStrategy: 'CLIP',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment,wrapStrategy)',
      },
    },
    // Header row height
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 36 },
        fields: 'pixelSize',
      },
    },
    // Write header values
    {
      updateCells: {
        rows: [{ values: headers.map((h) => ({ userEnteredValue: { stringValue: h } })) }],
        fields: 'userEnteredValue',
        start: { sheetId, rowIndex: 3, columnIndex: 0 },
      },
    },
    // Data rows — Montserrat font, alternating light grey
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: headers.length },
        cell: {
          userEnteredFormat: {
            textFormat: { foregroundColor: black, fontFamily: 'Montserrat', fontSize: 10 },
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
          },
        },
        fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)',
      },
    },
    // Freeze logo + header rows (rows 0-3 = 4 rows)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 4 },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // Set column widths
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 22, endIndex: 23 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 25, endIndex: 27 }, properties: { pixelSize: 350 }, fields: 'pixelSize' } },
    // Sheet tab colour — Koppoh green
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          tabColorStyle: { rgbColor: koppohGreen },
        },
        fields: 'tabColorStyle',
      },
    },
  ]

  const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ requests }),
  })
  const batchJson = await batchRes.json()
  if (!batchRes.ok) throw new Error(`Sheets batchUpdate failed: ${JSON.stringify(batchJson)}`)
  console.log('Sheet formatted successfully')
}

async function main() {
  token = await getGWSToken()
  authHeader = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  console.log('Uploading Koppoh logo...')
  const logoUrl = await uploadLogo()
  console.log('Logo URL:', logoUrl)

  console.log('Formatting BOP sheet...')
  await formatSheet(logoUrl)

  console.log('\nDone. Sheet: https://docs.google.com/spreadsheets/d/' + SHEET_ID)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
