import { Composition } from 'remotion'
import './styles.css'
import { FPS } from '../lib/time'
import { STAFF_DURATION, StaffDemo } from './staff-demo'

export function StaffRoot() {
  return (
    <Composition
      id="StaffDemo"
      component={StaffDemo}
      durationInFrames={STAFF_DURATION}
      fps={FPS}
      width={1920}
      height={1080}
    />
  )
}
