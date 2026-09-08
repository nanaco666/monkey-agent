import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { Platform } from 'react-native'
export interface Attachment { name: string; isImage?: boolean; mediaType?: string; data?: string; content?: string }
export async function pickImage(): Promise<Attachment | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
  if (result.canceled) return null
  const asset = result.assets[0]
  if (!asset.base64 || asset.base64.length > 4_000_000) throw new Error('请选择小于 3 MB 的图片')
  return { name: asset.fileName || 'image.jpg', isImage: true, mediaType: asset.mimeType || 'image/jpeg', data: asset.base64 }
}
export async function pickTextFile(): Promise<Attachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['text/*', 'application/json'], copyToCacheDirectory: true })
  if (result.canceled) return null
  const asset = result.assets[0]
  if (asset.size && asset.size > 200_000) throw new Error('文本附件不能超过 200 KB')
  const content = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text()
  if (!content.trim() || content.length > 200_000 || content.includes('\0')) throw new Error('请选择有效的 UTF-8 文本文件（不支持 PDF、Word）')
  return { name: asset.name, content }
}
