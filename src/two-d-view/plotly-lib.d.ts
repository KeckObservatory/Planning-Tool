// plotly.js ships types only for the root "plotly.js" module, not for these
// internal lib/* submodules used to assemble a custom, smaller trace bundle.
declare module 'plotly.js/lib/core' {
  const Plotly: typeof import('plotly.js') & { register: (modules: unknown[] | unknown) => void }
  export default Plotly
}
declare module 'plotly.js/lib/scattergl' {
  const trace: unknown
  export default trace
}
declare module 'plotly.js/lib/scatterpolar' {
  const trace: unknown
  export default trace
}
declare module 'plotly.js/lib/contour' {
  const trace: unknown
  export default trace
}
