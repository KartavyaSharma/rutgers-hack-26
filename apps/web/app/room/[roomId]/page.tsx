import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { RoomTablet } from '@/components/room/room-tablet'
import { isRoomId } from '@/lib/room-id'
import { isVoiceConfigured } from '@/lib/server/env'

export async function generateMetadata(props: PageProps<'/room/[roomId]'>): Promise<Metadata> {
  const { roomId } = await props.params
  return { title: `Room ${roomId}` }
}

export default async function RoomPage(props: PageProps<'/room/[roomId]'>) {
  // Rendered per request: whether voice is available depends on the server's env.
  await connection()
  const { roomId } = await props.params
  if (!isRoomId(roomId)) notFound()

  return <RoomTablet roomId={roomId} voiceEnabled={isVoiceConfigured()} />
}
