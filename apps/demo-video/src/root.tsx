import { Composition } from 'remotion'
import './styles.css'
import { DURATION, FPS, PatientDemo } from './patient-demo'
import { ruthScript } from './scenes/ruth'
import { SceneView } from './scenes/scene-view'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './stage/device'
import { RUTH_CLIP_LENGTH } from './story'

/** Ruth's tablet screen alone, played inside the staff video (see src/story.ts). */
function RuthTablet() {
  return <SceneView script={ruthScript} />
}

export function Root() {
  return (
    <>
      <Composition
        id="PatientDemo"
        component={PatientDemo}
        durationInFrames={DURATION}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="RuthTablet"
        component={RuthTablet}
        durationInFrames={RUTH_CLIP_LENGTH}
        fps={FPS}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
      />
    </>
  )
}
