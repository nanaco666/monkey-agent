export interface Connection { address: string; token: string }
const KEY = 'monkey.address.v1'
// Browser stores only the address. The connection key stays in memory.
export async function readConnection(): Promise<Connection | null> {
  const address = localStorage.getItem(KEY)
  return address ? { address, token: '' } : null
}
export async function saveConnection(connection: Connection) { localStorage.setItem(KEY, connection.address) }
export async function clearConnection() { localStorage.removeItem(KEY) }
