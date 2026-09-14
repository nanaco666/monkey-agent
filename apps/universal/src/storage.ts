import * as SecureStore from 'expo-secure-store'
import { File, Paths } from 'expo-file-system'
import { endpoint } from './client'
export interface Connection { address: string; token: string }
const KEY = 'monkey.connection.v1'
export async function readConnection(): Promise<Connection | null> {
  // A local installer may copy a one-time config into this app's USB sandbox.
  const file = new File(Paths.document, 'monkey-connection.json')
  if (file.exists) {
    const connection = JSON.parse(await file.text()) as Connection
    if (typeof connection.address !== 'string' || typeof connection.token !== 'string' || connection.token.length < 32) throw new Error('连接配置不完整')
    endpoint(connection.address)
    await saveConnection(connection)
    file.delete()
  }
  const value = await SecureStore.getItemAsync(KEY)
  try { return value ? JSON.parse(value) : null } catch { return null }
}
export async function saveConnection(connection: Connection) { await SecureStore.setItemAsync(KEY, JSON.stringify(connection)) }
export async function clearConnection() { await SecureStore.deleteItemAsync(KEY) }
