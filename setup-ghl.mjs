import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

for (const line of fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const LOCATION_ID = process.env.KOPPOH_GHL_LOCATION_ID
const PIT_TOKEN = process.env.KOPPOH_GHL_PIT_TOKEN
const BASE = 'https://services.leadconnectorhq.com'
const VERSION = '2021-07-28'

const headers = {
  Authorization: `Bearer ${PIT_TOKEN}`,
  Version: VERSION,
  'Content-Type': 'application/json',
}

async function ghl(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`GHL ${method} ${path} failed: ${JSON.stringify(json)}`)
  return json
}

async function createPipeline() {
  console.log('Creating BOP Admissions pipeline...')
  const data = await ghl('POST', '/opportunities/pipelines', {
    locationId: LOCATION_ID,
    name: 'BOP Admissions',
    stages: [
      { name: 'Applied', position: 0 },
      { name: 'In Community', position: 1 },
      { name: 'Webinar Attended', position: 2 },
      { name: 'Interested', position: 3 },
      { name: 'Offer Sent', position: 4 },
      { name: 'Paid Instalment', position: 5 },
      { name: 'Full Payment', position: 6 },
      { name: 'Lost / Cold', position: 7 },
    ],
  })
  console.log('Pipeline created:', data.pipeline?.id ?? JSON.stringify(data))
  return data.pipeline
}

async function createCustomFields() {
  const fields = [
    { name: 'BOP Score', key: 'bop_score', dataType: 'NUMERICAL', position: 0 },
    { name: 'BOP Score Percent', key: 'bop_score_percent', dataType: 'NUMERICAL', position: 1 },
    { name: 'BOP Achievement Goals', key: 'bop_achievement_goals', dataType: 'LARGE_TEXT', position: 2 },
    { name: 'BOP Main Business Gap', key: 'bop_main_business_gap', dataType: 'LARGE_TEXT', position: 3 },
    { name: 'BOP Response Summary', key: 'bop_response_summary', dataType: 'LARGE_TEXT', position: 4 },
    { name: 'Community Status', key: 'community_status', dataType: 'SINGLE_OPTIONS', position: 5, picklistOptions: ['Not Joined', 'Joined'] },
    { name: 'Webinar Status', key: 'webinar_status', dataType: 'SINGLE_OPTIONS', position: 6, picklistOptions: ['Not Registered', 'Registered', 'Attended', 'Missed'] },
    { name: 'Offer Status', key: 'offer_status', dataType: 'SINGLE_OPTIONS', position: 7, picklistOptions: ['Not Sent', 'Sent', 'Accepted', 'Declined'] },
    { name: 'Enrollment Status', key: 'enrollment_status', dataType: 'SINGLE_OPTIONS', position: 8, picklistOptions: ['Not Enrolled', 'Paid Instalment', 'Full Payment'] },
    { name: 'BOP Lead Source', key: 'bop_lead_source', dataType: 'SINGLE_OPTIONS', position: 9, picklistOptions: ['Instagram', 'WhatsApp', 'Bedge', 'YouTube', 'Friend or colleague', 'Koppoh community', 'Google or search', 'Other'] },
    { name: 'Sales Call Status', key: 'sales_call_status', dataType: 'SINGLE_OPTIONS', position: 10, picklistOptions: ['Not Needed', 'Needs Call', 'Booked', 'Done', 'No Show'] },
    { name: 'Payment Type', key: 'payment_type', dataType: 'SINGLE_OPTIONS', position: 11, picklistOptions: ['Paid Instalment', 'Full Payment'] },
    { name: 'Amount Paid', key: 'amount_paid', dataType: 'NUMERICAL', position: 12 },
    { name: 'Balance Remaining', key: 'balance_remaining', dataType: 'NUMERICAL', position: 13 },
    { name: 'Lost / Cold Reason', key: 'lost_cold_reason', dataType: 'LARGE_TEXT', position: 14 },
  ]

  console.log('\nCreating custom fields...')
  for (const field of fields) {
    try {
      const data = await ghl('POST', `/locations/${LOCATION_ID}/customFields`, {
        name: field.name,
        dataType: field.dataType,
        position: field.position,
        model: 'contact',
        options: field.picklistOptions,
      })
      console.log(`  Created: ${field.name} (${data.customField?.id ?? 'no id returned'})`)
    } catch (err) {
      console.warn(`  Skipped ${field.name}: ${err.message}`)
    }
  }
}

async function main() {
  if (!LOCATION_ID || !PIT_TOKEN) {
    console.error('Missing KOPPOH_GHL_LOCATION_ID or KOPPOH_GHL_PIT_TOKEN in .env.local')
    process.exit(1)
  }

  console.log('Setting up Koppoh GHL for BOP Admissions...\n')
  await createCustomFields()
  console.log('\nSetup complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
