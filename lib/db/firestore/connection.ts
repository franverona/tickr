import { Firestore } from '@google-cloud/firestore'

const globalForDb = globalThis as typeof globalThis & {
  firestoreClient?: Firestore
  firestoreWarned?: boolean
}

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIRESTORE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    throw new Error(
      'FIRESTORE_SERVICE_ACCOUNT_KEY is required when DB_TYPE="firestore" — paste the full ' +
        'service-account JSON (Firebase Console → Project Settings → Service Accounts → ' +
        'Generate new private key) as a single-line env var.',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(
      'FIRESTORE_SERVICE_ACCOUNT_KEY is not valid JSON — did you paste the full service-account ' +
        'key file contents (not the Web SDK config from firebaseConfig)?',
    )
  }

  const sa = parsed as Partial<ServiceAccount>
  for (const field of ['project_id', 'client_email', 'private_key'] as const) {
    if (typeof sa[field] !== 'string' || !sa[field]) {
      throw new Error(
        `FIRESTORE_SERVICE_ACCOUNT_KEY is missing "${field}" — this must be a service-account ` +
          'key (from Project Settings → Service Accounts), not the Web SDK config.',
      )
    }
  }
  return sa as ServiceAccount
}

export function getFirestoreClient(): Firestore {
  // The SDK sends every request to FIRESTORE_EMULATOR_HOST when it's set, with
  // no credentials, so the service-account key isn't needed (or used) then
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  if (!globalForDb.firestoreClient && emulatorHost) {
    console.warn(`[tickr] DB_TYPE=firestore — using the Firestore emulator at ${emulatorHost}.`)
    globalForDb.firestoreClient = new Firestore({ projectId: 'tickr-local' })
  }
  if (!globalForDb.firestoreClient) {
    const sa = getServiceAccount()
    if (!globalForDb.firestoreWarned) {
      console.warn(
        `[tickr] DB_TYPE=firestore — connecting to the LIVE remote Firestore project "${sa.project_id}". ` +
          'All reads and writes hit real data; set FIRESTORE_EMULATOR_HOST to use the local emulator.',
      )
      globalForDb.firestoreWarned = true
    }
    globalForDb.firestoreClient = new Firestore({
      projectId: sa.project_id,
      credentials: { client_email: sa.client_email, private_key: sa.private_key },
    })
  }
  return globalForDb.firestoreClient
}
