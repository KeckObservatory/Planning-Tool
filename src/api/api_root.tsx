import axios from 'axios';

import { handleResponse, handleError, intResponse, intError } from './response.tsx';
import { Target } from '../App.tsx';
import { CatalogTarget } from '../guide_star/guide_star_dialog.tsx';
import dayjs from 'dayjs';
import { delete_local_targets, load_local_targets, upsert_local_targets } from './local_targets_store.tsx';

// use browser localStorage instead of the backend data store
let localMode = false
export const setLocalMode = (enabled: boolean) => { localMode = enabled }

const SIMBAD_ADDR = "https://simbad.u-strasbg.fr/simbad/sim-id?NbIdent=1&submit=submit+id&output.format=ASCII&obj.bibsel=off&Ident="
const BASE_URL = "/api/planning_tool"
const SCHEDULE_URL = "/api/schedule"
const CATALOG_URL = "/api/catalogs"


export interface UserInfo {
    semids: any;
    Id: number;
    FirstName: string;
    LastName: string;
    Affiliation: string;
    AllocInst: string;
    is_admin?: boolean; //added by backend
}

export interface GaiaParams {
    ra_deg?: number,
    dec_deg?: number,
    parallax?: number,
    systemic_velocity?: number,
    g_mag?: number | string,
    t_eff?: number,
}

export interface GaiaResp {
    success: string,
    message: string,
    gaia_id: string,
    details?: string,
    gaia_params?: GaiaParams
}

export interface TelSchedule {
    Account: string,
    BaseInstrument: string | null,
    Comment: string | null,
    Date: string,
    EndTime: string,
    FractionOfNight: number,
    Institution: string,
    Instrument: string,
    Length: number,
    Location: string,
    ObsId: string,
    ObsType: string,
    Observers: string,
    ObservingStatus: string,
    PiEmail: string,
    PiFirstName: string,
    PiId: number,
    PiLastName: string,
    Principal: string,
    ProjCode: string,
    SchedId: number,
    Semester: string,
    StartTime: string,
    TelNr: number
}

export interface ObserverSchedule {
    Account: string,
    BaseInstrument: string,
    Comment: string | null,
    Date: string,
    EndTime: string,
    FractionOfNight: number,
    Institution: string,
    Instrument: string,
    Length: number,
    Location: string,
    ObsId: string,
    ObsType: string,
    Observers: string,
    ObservingStatus: string,
    PiEmail: string,
    PiFirstName: string,
    PiId: number,
    PiLastName: string,
    Principal: string,
    ProjCode: string,
    SchedId: number,
    Semester: string,
    StartTime: string,
    TelNr: number
}

const axiosInstance = axios.create({
    withCredentials: false,
    headers: {
        'Content-Type': 'application/json',
        'withCredentials': false,
    }
})
axiosInstance.interceptors.response.use(intResponse, intError);

export interface GetLogsArgs {
    n_logs: number,
    loggername: string,
    minutes?: number,
    subsystem?: string,
    semid?: string,
    startdatetime?: string,
    enddatetime?: string,
    dateformat?: string
}

export const get_schedule = (date: string, telnr: number): Promise<ObserverSchedule[]> => {
    const url = SCHEDULE_URL + `/getSchedule?date=${date}&telnr=${telnr}`
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_user_schedule = (obsid: number, startdate?: string, enddate?: string): Promise<ObserverSchedule[]> => {
    startdate = startdate ?? new Date().toISOString().split('T')[0]
    enddate = enddate ?? dayjs(new Date()).add(3, 'month').toISOString().split('T')[0]
    const url = SCHEDULE_URL + `/getScheduleByUser?startdate=${startdate}&enddate=${enddate}&obsid=${obsid}`
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_telescope_schedule = (date?: string): Promise<TelSchedule[]> => {
    date = date ?? new Date().toISOString().split('T')[0]
    const url = SCHEDULE_URL + `/getSchedule?date=${date}`
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_simbad = (obj: string): Promise<string> => {
    const url = SIMBAD_ADDR + obj
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_gaia = (gaia_id: string): Promise<GaiaResp> => {
    const url = BASE_URL + `/getGaiaParameters?gaia_id=${gaia_id}`
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_userinfo = (): Promise<UserInfo> => {
    let url = BASE_URL + '/userinfo'
    return axiosInstance.post(url, {})
        .then(handleResponse)
        .catch(handleError)
}

export const submit_target_to_starlist_dir = (formData: FormData): Promise<string> => {
    return axiosInstance.post(BASE_URL + '/writeToStarlistDirectory', formData, {
        headers: {
            'Content-Type': 'application/octet-stream',
        }
    }).then(handleResponse)
        .catch(handleError)
}

export interface SubmittedStarList {
    telescope: string,
    hstDate: string,
    piname: string,
    comments: string,
    slist: string,
}

export const submit_starlist = (starlist: SubmittedStarList): Promise<string> => {
    return axiosInstance.post(BASE_URL + '/submitStarList', starlist, {
    }).then(handleResponse)
        .catch(handleError)

}

export interface DeleteResponse {
    status: string
}

export const delete_target = (target_ids: string[]): Promise<DeleteResponse> => {
    if (localMode) return Promise.resolve(delete_local_targets(target_ids))
    const url = BASE_URL + "/deletePlanningToolTarget"
    return axiosInstance.put(url, { target_ids })
        .then(handleResponse)
        .catch(handleError)
}

export const observer_logout = (): Promise<string> => {
    const url = "/logout"
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_targets = (obsid?: number, target_id?: string, semid?: string): Promise<Target[]> => {
    // Local Mode has exactly one working set - obsid/target_id/semid filters don't apply.
    if (localMode) return Promise.resolve(load_local_targets())
    let url = BASE_URL + "/getPlanningToolTarget?"
    url += obsid ? "obsid=" + obsid : ""
    url += target_id ? "&target_id=" + target_id : ""
    url += semid ? "&semid=" + semid : ""
    return axiosInstance.get(url, {})
        .then(handleResponse)
        .catch(handleError)
}

// used for api. When ra/dec is an integer, the catalog image and targets api will fail
const ensure_decimal = (n: number): string => Number.isInteger(n) ? n.toFixed(1) : `${n}`

export const get_catalog_image = (dss_name: string, ra: number, dec: number, window_size: number): string => {
    const ws = JSON.stringify({ "size": window_size, "units": "degrees" })
    let url = location.origin + CATALOG_URL + `/image/?position={"ra":${ensure_decimal(ra)},"dec":${ensure_decimal(dec)}}&window-size=${ws}&catalog=${dss_name}&format=png`
    // let url = "https://vm-appserver" + CATALOG_URL + `/image/?position={"ra":${ensure_decimal(ra)},"dec":${ensure_decimal(dec)}}&window-size=${ws}&catalog=${dss_name}&external=1&format=png`
    console.log(url)
    return url
}

export const get_catalog_targets = (catalog_name: string, ra: number, dec: number, radius: number, magRange?: [string, string]): Promise<CatalogTarget[]> => {
    let url = location.origin + CATALOG_URL + `/sources/?position=%7B%22ra%22:${ensure_decimal(ra)},%22dec%22:${ensure_decimal(dec)}%7D&radius=${radius}&window-size=%7B%22size%22:${radius},%22units%22:%22degrees%22%7D&catalog=${catalog_name}&external=1&no-limit=1`
    // let url = "https://vm-appserver" + CATALOG_URL + `/sources/?position=%7B%22ra%22:${ensure_decimal(ra)},%22dec%22:${ensure_decimal(dec)}%7D&radius=${radius}&window-size=%7B%22size%22:${radius},%22units%22:%22degrees%22%7D&catalog=${catalog_name}&external=1&no-limit=1`
    if (magRange) {
        url += `&mag-min=${magRange[0]}&mag-max=${magRange[1]}`
    }
    console.log(url)
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_image_catalogs = (): Promise<string[]> => {
    let url = location.origin + CATALOG_URL + `/available/image`
    console.log(url)
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export const get_catalogs = (): Promise<string[]> => {
    let url = location.origin + CATALOG_URL + `/available/source`
    console.log(url)
    return axiosInstance.get(url)
        .then(handleResponse)
        .catch(handleError)
}

export interface SubmitTargetResponse {
    targets: Target[]
    errors: string[]
}

export const submit_target = (targets: Target[]): Promise<SubmitTargetResponse> => {
    if (localMode) return Promise.resolve(upsert_local_targets(targets))
    const url = BASE_URL + "/submitPlanningToolTarget"
    return axiosInstance.post(url, { targets })
        .then(handleResponse)
        .catch(handleError)
}