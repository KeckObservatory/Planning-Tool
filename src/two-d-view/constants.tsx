export const FOVlink = 'FEATURES.json'
export const ROUND_MINUTES = 10 // minutes
export const STEP_SIZE = 1/6 //hours
export const TIMES_START = -7 //hours
export const TIMES_END = 7 //hours
export const RADIUS_EARTH = 6378.1 // km
export const ATMOSPHERE_HEIGHT = 50 // km

interface SemesterDates {
    start_day: number
    start_month: number
    end_day: number
    end_month: number
    plus_year?: number
}

interface SemesterRange {
    'A': SemesterDates
    'B': SemesterDates
}
export const SEMESTER_RANGES: SemesterRange = {
    'A': {
        start_day: 1,
        start_month: 2,
        end_day: 31,
        end_month: 7
    },
    'B': {
        start_day: 1,
        start_month: 8,
        end_day: 31,
        end_month: 1,
        plus_year: 1
    }
}

export const MARKER_SIZE = 10 //pxl radius
export const XAXIS_DTICK = 15 * 24 * 60 * 60 * 1000 // milliseconds
export const MOON_MARKER_LINE_WIDTH = 2 //pxl
export const MOON_MARKER_SIZE = 2 //pxl
export const MOON_RADIUS = .52 // degrees

//GUIDE STAR TOOL
export const MAG_RANGE = [1, 20] // mag range for guide star catalog queries
export const DEFAULT_WINDOW_SIZE = 600 / 3600 // degrees, size of window to query for guide stars
export const MOSFIRE_WINDOW_SIZE = 1200 / 3600 // degrees, size of window to query for guide stars
export const DEFAULT_RA = "12:48:45.8623" //NGC4711
export const DEFAULT_DEC = "+35:19:57.8810"  //NGC4711
export const AO_INSTRUMENTS: string[] = ['OSIRIS', 'NIRC2', 'NIRSPAO'] //instruments that can use AO guide stars
export const TRICK_INSTRUMENTS: string[] = ['OSIRIS']
//img catalog constants
export const ZOOM_SPEED = 0.001;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 20;
export const ZOOM_DEFAULT = 3; //For the guide star viewer
export const MOSFIRE_ZOOM_DEFAULT = 1.5; //For the guide star viewer

export const TARGET_LENGTH = 15 // 15 characters for target name
export const TARGET_NAME_LENGTH_PADDED = TARGET_LENGTH + 1 // 15 characters for target name, one space at the end

export const DEFAULT_OPACITY = 'FF' //Hex values appended to color
export const NON_OBSERVABLE_OPACITY = '70' //Hex values appended to color
export const AIRMASS_LIMIT = 5
export const LASER_LIMIT = 25 // lasing below 25 degrees not allowed
export const TWILIGHT_SHADE= '#BFBFBF'
export const AMATEUR_TWILIGHT_SHADE = '#9f9f9f'
export const ASTRONOMICAL_TWILIGHT_SHADE = '#818181'
export const CROSSING_TOLERANCE_MS = 1000 // used to determine nasmyth/shutter limit crossings


export const EXTINCTION_COEFF = 0.172 // extinction coefficient [mag/airmass]

// dark zenith sky brightness taken from
//https://www.cfht.hawaii.edu/Instruments/ObservatoryManual/CFHT_ObservatoryManual_(Sec_2).html
export const DARK_ZENITH_SKY_BRIGHTNESS = 21.1 // mag/arcsec^2 


//AGR constants
// AGR mechanical range is +/-140 deg (InstrumentInfo.inc $agrInfo).
export const AGR_LIMIT_DEG = 140;
// Default agrInfo.rotationOffset from InstrumentInfo.inc.
export const DEFAULT_AGR_OFFSET_DEG = 13;

export const DUPLICATE_COORD_TOLERANCE_DEG = 1 / (2 * 3600) // 1/2 arcsecond