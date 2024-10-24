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
import { SimbadTargetData } from './simbad_button.tsx';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { LicenseInfo } from '@mui/x-license';
import licenseKey from './license.json'
import Skeleton from '@mui/material/Skeleton';
import { get_targets, get_userinfo } from './api/api_root.tsx';

const CONFIG_PATH = './config.json'

LicenseInfo.setLicenseKey(
  licenseKey.license_key
)


export const get_config = async () => {
  const resp = await fetch(
    CONFIG_PATH
  )
  const json = await resp.json()
  return json
}

export type Status = "EDITED" | "CREATED"

export interface Target extends SimbadTargetData {
  _id: string,
  obsid: number,
  target_name?: string,
  j_mag?: number,
  t_eff?: number,
  comment?: string,
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

export interface KeckGeoModel {
    K1: GeoModel
    K2: GeoModel
}

export interface GeoModel {
    r0: number,
    r1: number,
    r2: number,
    r3: number,
    t0: number,
    t1: number,
    t2: number,
    t3: number,
    trackLimit: number
}


interface ConfigFile {
  default_table_columns: string[];
  csv_order: string[];
  pinned_table_columns: { 'left': string[], 'right': string[] };
  timezone: string,
  time_format: string,
  date_time_format: string,
  keck_geometry: KeckGeoModel 
  keck_latitude: number, //deg
  keck_longitude: number, // Keck Observatory longitude west of Greenwich [deg]
  keck_elevation: number, // km
}

interface State {
  username: string;
  obsid: number;
  is_admin: boolean;
  config: ConfigFile; 
}

interface StateContextProps extends State{
  targets: Target[];
  setTargets: React.Dispatch<React.SetStateAction<Target[]>>; 
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
}

const StateContext = React.createContext<StateContextProps>({} as StateContextProps)
export const useStateContext = () => React.useContext(StateContext)

function App() {
  const [darkState, setDarkState] = useQueryParam('darkState', withDefault(BooleanParam, true));
  const [openSnackbar, setOpenSnackbar] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState<SnackbarMessage>({ message: 'default message' })
  const [state, setState] = useState<State>({} as State);
  const theme = handleTheme(darkState)
  const [targets, setTargets] = useState<Target[]>([])

  useEffect(() => {
    const fetch_data = async () => {
      // const userinfo = await get_userinfo_mock();
      const userinfo = await get_userinfo();
      const init_targets = await get_targets(userinfo.Id)
      console.log('targets', init_targets)
      const config = await get_config()
      const username = `${userinfo.FirstName} ${userinfo.LastName}`;
      const init_state = { config, username, obsid: userinfo.Id, is_admin: userinfo.is_admin ?? false }
      console.log('setting state', init_state)
      setState(init_state)
      setTargets(init_targets)
    }
    fetch_data()
    console.log('App mounted')
  }, [])

  const handleThemeChange = () => {
    setDarkState(!darkState)
  }

  return (
    <ThemeProvider theme={theme} >
      <CssBaseline />
      <StateContext.Provider value={{...state, targets, setTargets}}>
        <SnackbarContext.Provider value={{
          snackbarOpen: openSnackbar,
          setSnackbarOpen: setOpenSnackbar,
          snackbarMessage, setSnackbarMessage
        }}>
          <TopBar darkState={darkState} handleThemeChange={handleThemeChange} username={state.username} />
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
              sx={{ width: '100%' }}
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
                minWidth: '1500px',
                flexDirection: 'column',
              }}
            >
              {Object.keys(state).length > 0 ? (<TargetTable />):
              (<Skeleton variant="rectangular" width="100%" height={500} />)}
            </Paper>
          </Stack>
        </SnackbarContext.Provider>
      </StateContext.Provider>
    </ThemeProvider >
  )
}

export default App
