import * as SecureStore from 'expo-secure-store'
export interface Connection { address: string; token: string }
const KEY = 'monkey.connection.v1'
export async function readConnection(): Promise<Connection | null> {
  const value = await SecureStore.getItemAsync(KEY)
  try { return value ? JSON.parse(value) : null } catch { return null }
}
export async function saveConnection(connection: Connection) { await SecureStore.setItemAsync(KEY, JSON.stringify(connection)) }
export async function clearConnection() { await SecureStore.deleteItemAsync(KEY) }
