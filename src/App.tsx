import './App.css'
import { handleTheme } from './theme.tsx';
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { TopBar } from './top_bar.tsx';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import React, { useEffect, useState } from 'react';
import { BooleanParam, useQueryParam, withDefault } from 'use-query-params';
import TargetTable from './target_table.tsx';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import { get_targets, get_userinfo, setLocalMode } from './api/api_root.tsx';
import { SimbadTargetData } from './catalog_button.tsx';
import { config } from './config.tsx';

export type Status = "EDITED" | "CREATED"

export type RotatorMode = "pa" | "vertical" | "stationary"
export type TelescopeWrap = "shortest" | "south" | "north"
export type Lgs = '0' | '1' | 'None' 

export interface Target extends SimbadTargetData {
  _id: string,
  obsid: number,
  del_flag?: number,
  state?: string,
  target_name?: string,
  lgs?: Lgs,
  b_mag?: number | string,
  v_mag?: number | string,
  r_mag?: number | string,
  h_mag?: number | string,
  k_mag?: number | string,
  b_m_v_mag?: number | string,
  b_m_r_mag?: number | string,
  ra_offset?: number | string,
  dec_offset?: number | string,
  rotator_mode?: RotatorMode,
  rotator_pa?: number | string,
  telescope_wrap?: TelescopeWrap
  d_ra?: number | string,
  d_dec?: number | string,
  t_eff?: number | string,
  comment?: string,
  tags?: string[],
  science_target?: string,
  semids?: string[];
  priority?: number | string, //user-set priority for the target list. see sort_by_priority.
  status?: Status //used to track row/form edits and updates them accordingly.
}

export interface SnackbarMessage {
  message: string;
  severity?: 'success' | 'error' | 'warning' | 'info';
}

export interface SnackbarContextProps {
  snackbarOpen: boolean;
  setSnackbarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  snackbarMessage: SnackbarMessage;
  setSnackbarMessage: React.Dispatch<React.SetStateAction<SnackbarMessage>>;
}

const init_snackbar_context: SnackbarContextProps = {
  snackbarOpen: false,
  setSnackbarOpen: () => { },
  snackbarMessage: { severity: 'success', message: 'defaultMessage' },
  setSnackbarMessage: () => { },
}

const SnackbarContext = React.createContext<SnackbarContextProps>(init_snackbar_context);
export const useSnackbarContext = () => React.useContext(SnackbarContext);

export interface GeoModel {
  r0: number,
  r1: number,
  r2: number,
  r3: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  left_north_wrap: number,
  right_south_wrap: number,
  trackLimit: number
}

export interface LngLatEl {
  lat: number,
  lng: number,
  el: number
}

export type ViewMode = "ao" | "non_ao"

export type ConfigFile = typeof config
export interface State {
  username: string;
  obsid: number;
  is_admin: boolean;
  semids: string[];
  config: ConfigFile;
  targets?: Target[]
  setTargets?: React.Dispatch<React.SetStateAction<Target[] | undefined>>;
}

export interface UserInfo {
  status: string;
  Id: number;
  Title: string;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  Email: string;
  Affiliation: string;
  WorkArea: string;
  Interests: string;
  Street: string;
  City: string;
  State: string;
  Country: string;
  Zip: string;
  Phone: string;
  Fax: string;
  URL: string;
  ModDate: string;
  Exposed: string;
  username: string;
  resetcode: number;
  AllocInst: string;
  BadEmail: string;
  Category: string;
  is_admin: boolean; //added by backend
  semids: string[]; //added by backend
}

const StateContext = React.createContext<State>({} as State)
export const useStateContext = () => React.useContext(StateContext)

function App() {
  const [darkState, setDarkState] = useQueryParam('darkState', withDefault(BooleanParam, true));
  const [localMode, setLocalModeParam] = useQueryParam('localMode', withDefault(BooleanParam, false));
  const [ semid ] = useQueryParam<string>('semid');
  const [openSnackbar, setOpenSnackbar] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState<SnackbarMessage>({ message: 'default message' })
  const [state, setState] = useState<State>({config,
    semids: [],
    is_admin: false,
    username:"",
    targets: undefined,
  } as unknown as State);
  const theme = handleTheme(darkState)

  const setTargets: React.Dispatch<React.SetStateAction<Target[] | undefined>> = (action) => {
    setState((prevState) => ({
      ...prevState,
      targets: typeof action === 'function'
        ? (action as (prev: Target[] | undefined) => Target[] | undefined)(prevState.targets)
        : action,
    }))
  }

  useEffect(() => {
    setLocalMode(localMode)

    const fetch_targets = async () => {
      if (semid) {
        let tgts = await get_targets(undefined, undefined, semid)
        setState((prevState) => ({ ...prevState, targets: [...tgts] }))
      }
      else if (state.obsid && (semid === undefined || semid === "")) {
        let tgts = await get_targets(state.obsid)
        setState((prevState) => ({ ...prevState, targets: [...tgts] }))
      }
    }
    fetch_targets()
  }, [semid, localMode])

  useEffect(() => {

    const fetch_data = async () => {
      setLocalMode(localMode)
      var userinfo = await get_userinfo();
      var username = `${userinfo.FirstName} ${userinfo.LastName}`;
      var init_state: State = {
        config,
        username,
        obsid: userinfo.Id,
        semids: userinfo.semids ?? [],
        is_admin: userinfo.is_admin ?? false
      }
      setState(init_state)
      if (init_state.obsid) {
        let tgts = await get_targets(init_state.obsid, undefined, semid)
        setState((prevState) => ({ ...prevState, targets: [...tgts] }))
      }
    }

    fetch_data()
  }, [])

  const handleThemeChange = () => {
    setDarkState(!darkState)
  }

  const handleLocalModeChange = () => {
    setLocalModeParam(!localMode)
  }

  return (
    <ThemeProvider theme={theme} >
      <CssBaseline />
      <StateContext.Provider value={{ ...state, setTargets }}>
        <SnackbarContext.Provider value={{
          snackbarOpen: openSnackbar,
          setSnackbarOpen: setOpenSnackbar,
          snackbarMessage, setSnackbarMessage
        }}>
          <TopBar
            darkState={darkState}
            handleThemeChange={handleThemeChange}
            username={state.username}
            localMode={localMode}
            handleLocalModeChange={handleLocalModeChange}
          />
          <Snackbar
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            autoHideDuration={3000}
            open={openSnackbar}
            onClose={() => setOpenSnackbar(false)}
          >
            <Alert
              onClose={() => setOpenSnackbar(false)}
              severity={snackbarMessage.severity}
              variant="filled"
              sx={{ width: '100%', whiteSpace: 'pre-line' }}
            >
              {snackbarMessage.message}
            </Alert>
          </Snackbar>
          <Stack sx={{ marginBottom: '4px', marginTop: '12px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
            <Paper
              sx={{
                marginTop: '12px',
                padding: '6px',
                maxWidth: '2000px',
                minWidth: '1600px',
                flexDirection: 'column',
              }}
            >
              {state.targets === undefined ? (<Skeleton variant="rectangular" width="100%" height={500} />) :
                <TargetTable targets={state.targets} />}
            </Paper>
          </Stack>
        </SnackbarContext.Provider>
      </StateContext.Provider>
    </ThemeProvider >
  )
}

export default App
