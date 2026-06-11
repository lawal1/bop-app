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

const tags = [
  'bop-applicant',
  'bop-hot-lead',
  'bop-warm-lead',
  'bop-cold-lead',
  'bop-in-community',
  'bop-webinar-attended',
  'bop-interested',
  'bop-offer-sent',
  'bop-paid-instalment',
  'bop-full-payment',
  'bop-lost-cold',
  'bop-call-booked',
  'bop-call-done',
]

async function createTag(name) {
  const res = await fetch(`${BASE}/locations/${LOCATION_ID}/tags`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PIT_TOKEN}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Failed to create tag "${name}": ${JSON.stringify(json)}`)
  return json
}

async function main() {
  console.log('Creating BOP tags in Koppoh GHL...\n')
  for (const tag of tags) {
    try {
      await createTag(tag)
      console.log(`  Created: ${tag}`)
    } catch (err) {
      console.warn(`  Skipped: ${tag} — ${err.message}`)
    }
  }
  console.log('\nDone.')
}

main().catch((err) => { console.error(err); process.exit(1) })
