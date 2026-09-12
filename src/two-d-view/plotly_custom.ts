import type { ComponentClass } from 'react'
import type { PlotParams } from 'react-plotly.js'
import Plotly from 'plotly.js/lib/core'
import scattergl from 'plotly.js/lib/scattergl'
import scatterpolar from 'plotly.js/lib/scatterpolar'
import contour from 'plotly.js/lib/contour'
import createPlotlyComponent from 'react-plotly.js/factory'

// The default "plotly.js" / "react-plotly.js" export registers every trace
// type (3d, geo, mapbox, finance, ...), which is most of the ~4.8MB minified
// plotly chunk. Only scatter (registered by core), scattergl, scatterpolar,
// and contour are actually used across the two-d-view charts, so build a
// trimmed Plotly with just those registered.
Plotly.register([scattergl, scatterpolar, contour])

export default createPlotlyComponent(Plotly) as ComponentClass<PlotParams>
