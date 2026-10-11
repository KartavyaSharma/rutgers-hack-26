// Images imported from code (Remotion's webpack serves them and gives back a URL).
declare module '*.png' {
  const src: string
  export default src
}
