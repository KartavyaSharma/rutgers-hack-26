import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { RoomScreen } from '@/components/room/room-screen'
import { readPatient } from '@/lib/patient/chart'
import { isRoomId } from '@/lib/room-id'
import { isVoiceConfigured } from '@/lib/server/env'

export async function generateMetadata(props: PageProps<'/room/[roomId]'>): Promise<Metadata> {
  const { roomId } = await props.params
  return { title: `Room ${roomId}` }
}

export default async function RoomPage(props: PageProps<'/room/[roomId]'>) {
  // Rendered per request: voice depends on the server's env, and the chart is read fresh.
  await connection()
  const { roomId } = await props.params
  if (!isRoomId(roomId)) notFound()

  const patient = await readPatient(roomId)
  return <RoomScreen patient={patient} voiceEnabled={isVoiceConfigured()} />
}
