import AppBar from '@mui/material/AppBar';
import HelpIcon from '@mui/icons-material/Help';
import Switch from "@mui/material/Switch"
import FormControlLabel from "@mui/material/FormControlLabel"
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import DoorFrontIcon from '@mui/icons-material/DoorFront';
import LogoutIcon from '@mui/icons-material/Logout';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import MarkdownDialogButton from './markdown_dialog.tsx';
import React from 'react';
import { config } from './config.tsx';
import { observer_logout } from './api/api_root.tsx';

// Switch's `icon`/`checkedIcon` replace the thumb outright rather than sitting inside it, so
// this has to redraw the circle MUI would have drawn - 20px is the built-in thumb's size.
const ThemeSwitchThumb = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: '50%',
  backgroundColor: theme.palette.common.white,
  boxShadow: theme.shadows[1],
  '& > svg': {
    fontSize: 14,
  },
}))

interface Props {
  username?: string,
  darkState: boolean,
  handleThemeChange: () => void
  localMode: boolean,
  handleLocalModeChange: () => void
}

export function TopBar(props: Props) {

  const [helpMsg, setHelpMsg] = React.useState('')
  const [piPortal, setPiPortal] = React.useState('')

  React.useEffect(() => {
    const init_msgs = async () => {
      const welcomeResp = await fetch(config.help_msg_filename)
      const wtxt = await welcomeResp.text()
      setHelpMsg(wtxt)
      setPiPortal(config.pi_portal_url)
    }

    init_msgs()
  }, [])

  const handleLogout = async () => {
    await observer_logout()
    window.open(piPortal, "_self")
  }

  const handlePortalClick = () => {
    window.open(piPortal, "_self")
  }

  const handleSurveyClick = () => {

    window.open('https://docs.google.com/forms/d/e/1FAIpQLSduMTA4YBCa2zrO7736u8BpztXqsUu2W9zkdTuLx8UJ8Ry4dA/viewform?usp=dialog', '_blank')
  }

  const color = props.darkState ? 'primary' : 'secondary'

  // Local mode repaints the AppBar a mid-tone blue, where the accent colours wash out. Black
  // reads well there and on the light-mode bar, but the dark-mode bar is near-black - so keep
  // the accent colour in that one case rather than making the icon disappear into it.
  const onDarkAppBar = props.darkState && !props.localMode
  const helpIconColor = onDarkAppBar ? 'primary.main' : 'common.black'


  return (
    <AppBar
      position='sticky'
      sx={props.localMode ? { bgcolor: '#678db0' } : undefined}
    >
      <Toolbar
        sx={{
          paddingRight: '8px',
          paddingLeft: '20px'
        }}
      >
        <Tooltip title="Local Mode: work from a loaded file, stored in this browser, instead of the database">
          <Stack direction="row" alignItems="center" sx={{ color: 'inherit' }}>
            {/* Names the switch's off position, so the toggle reads as the two modes it picks between. */}
            <Typography variant="body1">Database Mode</Typography>
            <FormControlLabel
              // FormControlLabel defaults to marginLeft: -11px, which would pull the switch
              // back over the "Database Mode" text; the Switch's own padding is the gap.
              sx={{ color: 'inherit', marginLeft: 0 }}
              control={
                <Switch
                  checked={props.localMode}
                  onChange={props.handleLocalModeChange} />
              }
              label="Local Mode"
            />
          </Stack>
        </Tooltip>
        <Typography
          component="h1"
          variant="h6"
          color="inherit"
          noWrap
          sx={{
            marginLeft: '12px',
            flexGrow: 1,
          }}
        >
          Planning Tool
        </Typography>
        {props.localMode ? (
          <Tooltip title="Local Mode stores targets on the browser.">
            <Chip
              label="LOCAL MODE ON"
              size="small"
              sx={{
                bgcolor: '#ffd600',
                color: '#000',
                fontWeight: 700,
                letterSpacing: 1,
                marginRight: '12px'
              }}
            />
          </Tooltip>
        ) : (
          <Tooltip title="Database mode stores targets at Keck.">
            <Chip
              label="DATABASE MODE ON"
              size="small"
              sx={{
                bgcolor: '#ffd600',
                color: '#000',
                fontWeight: 700,
                letterSpacing: 1,
                marginRight: '12px'
              }}
            />
          </Tooltip>
        )}
        <Typography
          component="h3"
          variant="h6"
          color="inherit"
          noWrap
          sx={{
            marginLeft: '12px',
            flexGrow: 1,
          }}
        >
          Welcome {props.username}
        </Typography>
        <Button
          variant='contained'
          onClick={handleSurveyClick}>
          Submit Survey
        </Button>
        <Tooltip title="Return to Observer Portal">
          <IconButton
            aria-label="open drawer"
            onClick={handlePortalClick}
          >
            <DoorFrontIcon id="observer-portal-icon" />
          </IconButton>
        </Tooltip>
        <MarkdownDialogButton
          header='Help'
          icon={<HelpIcon sx={{ color: helpIconColor }} />}
          msg={helpMsg}
          tooltipMsg='Select to view help message'
        />
        <Tooltip title="Toggle on for dark mode">
          <Switch
            checked={props.darkState}
            onChange={props.handleThemeChange}
            icon={
              <ThemeSwitchThumb>
                <LightModeIcon sx={{ color: '#e65100' }} />
              </ThemeSwitchThumb>
            }
            checkedIcon={
              <ThemeSwitchThumb>
                <DarkModeIcon sx={{ color: '#3f51b5' }} />
              </ThemeSwitchThumb>
            } />
        </Tooltip>
        <Tooltip title="Logout and return to the Observer Portal">
          <IconButton color={color} onClick={handleLogout} aria-label="logout">
            <LogoutIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  )
}