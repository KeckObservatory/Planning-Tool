import React from 'react';
import Button from '@mui/material/Button';
import DialogContentText from '@mui/material/DialogContentText';
import { MenuItem, Menu, Stack, Tooltip, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/Upload';
import { Target, useStateContext, useSnackbarContext } from './App';
import target_schema from './target_schema.json'
import { v4 as randomId } from 'uuid';
import { format_string_array, PropertyProps, raDecFormat, TargetProps } from './target_edit_dialog';
import { DialogComponent } from './dialog_component';
import { ra_dec_to_deg } from './two-d-view/sky_view_util';
import { TARGET_NAME_LENGTH_PADDED } from './two-d-view/constants';

interface Props {
    setTargets: Function
}

interface UploadProps extends Props {
    setOpen?: Function
}


const targetProps = target_schema.properties as TargetProps

const starlistToKeyMapping = Object.fromEntries(
    Object.entries(targetProps)
    .filter(([_key, prop]) => prop.starlist_key)
    .map(([key, prop]) => [prop.starlist_key, key])
)

let hdrToKeyMapping = Object.fromEntries(Object.entries(targetProps).map(([key, value]: [keyof TargetProps, PropertyProps]) => {
    const desc = value.short_description ?? value.description
    return [desc, key]
}))

const convert_value_to_type = (props: PropertyProps, value: unknown): unknown => {
    const type = props.type
    if (type.includes('string')) { // multitypes default to string
        //@ts-ignore
        return String(value)
    }
    else if (type.includes('number') || type.includes('integer')) {
        //@ts-ignore
        typeof value === 'string' && (value = value.replaceAll('\'', ''))
        return Number(value)
    }
    else if (type.includes('boolean')) {
        //@ts-ignore
        return Boolean(value)
    }
    else if (type.includes('array') && typeof value === 'string') {
        const arr = value.split(',') as string[]
        return arr.map(item => convert_value_to_type(props.items as PropertyProps, item))
    }
    return value
}

export const format_target_property = (key: keyof Target, value: unknown, props: PropertyProps) => {
    let fmtValue = convert_value_to_type(props, value)
    if (key === 'ra' || key === 'dec') {
        //@ts-ignore
        fmtValue = raDecFormat(fmtValue as string)
    }
    else if (['tags', 'semids'].includes(key)) {
        //@ts-ignore
        fmtValue = format_string_array(fmtValue as Array<string>)
    }
    return fmtValue
}

export const format_targets = (tgts: UploadedTarget[], targetProps: TargetProps) => {
    const fmtTgts = tgts.map((tgt) => {
        Object.entries(tgt).forEach(([key, value]) => {
            if (value === undefined || value === null) return
            const props = targetProps[key]
            if (!props) {
                console.log('tgt', tgt)
            }
            else {
                const fmtValue = format_target_property(key as keyof Target, value, props)
                //@ts-ignore
                tgt[key] = fmtValue
            }
        })
        return tgt
    })
    return fmtTgts
}

const parse_json = (filename: string, contents: string) => {
    let tgts = JSON.parse(contents)
    const filename_tag = `${filename}`
    tgts = tgts.map( (tgt: Target) => {
        tgt.tags = tgt.tags ? [filename_tag, ...tgt.tags ] : [filename_tag]
        tgt.tags = [...new Set(tgt.tags)] //unique tags
        return tgt
    })

    return tgts
}

/*
const re_valid = r"""
# Validate a CSV string having single, double or un-quoted values.
^                                   # Anchor to start of string.
\s*                                 # Allow whitespace before value.
(?:                                 # Group for value alternatives.
  '[^'\\]*(?:\\[\S\s][^'\\]*)*'     # Either Single quoted string,
| "[^"\\]*(?:\\[\S\s][^"\\]*)*"     # or Double quoted string,
| [^,'"\s\\]*(?:\s+[^,'"\s\\]+)*    # or Non-comma, non-quote stuff.
)                                   # End group of value alternatives.
\s*                                 # Allow whitespace after value.
(?:                                 # Zero or more additional values
  ,                                 # Values separated by a comma.
  \s*                               # Allow whitespace before value.
  (?:                               # Group for value alternatives.
    '[^'\\]*(?:\\[\S\s][^'\\]*)*'   # Either Single quoted string,
  | "[^"\\]*(?:\\[\S\s][^"\\]*)*"   # or Double quoted string,
  | [^,'"\s\\]*(?:\s+[^,'"\s\\]+)*  # or Non-comma, non-quote stuff.
  )                                 # End group of value alternatives.
  \s*                               # Allow whitespace after value.
)*                                  # Zero or more additional values
$                                   # Anchor to end of string.
"""

const re_value = r"""
# Match one value in valid CSV string.
(?!\s*$)                            # Don't match empty last value.
\s*                                 # Strip whitespace before value.
(?:                                 # Group for value alternatives.
  '([^'\\]*(?:\\[\S\s][^'\\]*)*)'   # Either $1: Single quoted string,
| "([^"\\]*(?:\\[\S\s][^"\\]*)*)"   # or $2: Double quoted string,
| ([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)  # or $3: Non-comma, non-quote stuff.
)                                   # End group of value alternatives.
\s*                                 # Strip whitespace after value.
(?:,|$)                             # Field ends on comma or EOS.
"""
*/


const csv_to_array = (text: string) => {
    var re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
    var re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    // Return NULL if input string is not well formed CSV string.
    if (!re_valid.test(text)) {
        console.warn('csv_to_array: invalid csv string')
        return null;
    }
    var a = [];                     // Initialize array to receive values.
    text.replace(re_value, // "Walk" the string using replace with callback.
        //@ts-ignore
        function (m0, m1, m2, m3) {
            // Remove backslash from \' in single quoted values.
            if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
            // Remove backslash from \" in double quoted values.
            else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
            else if (m3 !== undefined) a.push(m3);
            return ''; // Return empty string.
        });
    // Handle special case of empty last value.
    if (/,\s*$/.test(text)) a.push('');
    return a;
};

const parse_csv = (filename: string, contents: string) => {
    let [headerStr, ...lines] = contents.split('\n')
        .map(s => s.replace('\r', ''))

    const header = csv_to_array(headerStr)
    if (header === null) {
        console.warn('invalid csv header')
        return []
    }

    const tgtValues = lines.map(line => csv_to_array(line)).filter((item) => item !== null) as string[][]
    const tgts = tgtValues.map(line => {
        if (line.length !== header.length) {
            console.warn('invalid csv line', line)
            return
        }
        const tgt = {} as UploadedTarget;
        header.forEach((hdr, index) => {
            const key = hdrToKeyMapping[hdr]
            let value = line.at(index)
            //@ts-ignore
            key && (tgt[key] = value)
        });

        const existingTags = typeof tgt.tags === 'string'
            ? tgt.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : (tgt.tags as string[] | undefined) ?? []
        tgt.tags = [...new Set([filename, ...existingTags])] //unique tags

        return tgt;
    }).filter((item) => item !== undefined) as UploadedTarget[];

    return tgts
}

const split_at = (index: number, str: string) => {
    let tabidx = str.lastIndexOf('\t')
    while (tabidx > 0 && tabidx > index) { // find the last tab in the first 0..index characters. That
        tabidx = str.slice(0, tabidx).lastIndexOf('\t') // get the next tab and check again
    }
    if (tabidx > 0) { // tab(s) in target name
        console.log('tabs in target name: targetName', str.slice(0, tabidx))
        const targetName = str.slice(0, tabidx).replaceAll('\t', ' ').padEnd(TARGET_NAME_LENGTH_PADDED, ' ')
        const targetBody = str.slice(tabidx + 1).replaceAll('\t', ' ').trimStart()
        console.log('targetName', targetName, 'targetBody', targetBody)
        return [targetName, targetBody]
    }


    // older files may have names longer than be longer than the 15 char limit. This relaxes this constraint
    let sliceIdx = index
    let substr = str.slice(index - 1)
    while (substr.length > 0 && substr[0].trim() !== '') {
        substr = substr.slice(1)
        sliceIdx += 1
    }

    let [targetName, targetBody] = [str.slice(0, sliceIdx).slice(0, index), str.slice(sliceIdx)]
    targetBody = targetBody.replaceAll('\t', ' ') // remove tabs from the body (not allowed but throw them a bone)
    console.log('idx', sliceIdx, 'targetName', targetName, 'targetBody', targetBody)

    return [targetName, targetBody]
}

// pads the digits of a possibly-signed numeric string, keeping the sign in front (e.g. "-5" -> "-05")
const pad_signed_digits = (val: string, len: number) => {
    const sign = val[0] === '+' || val[0] === '-' ? val[0] : ''
    const digits = sign ? val.slice(1) : val
    return sign + digits.padStart(len, '0')
}

const parse_comments = (lines: string[]) => {

    let semids = [] as string[]
    let tags = [] as string[]
    let comments = [] as string[]
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lower = line.toLowerCase()
        // handle semids in comments (e.g. # semids: sem1, sem2)
        if (lower.includes('semids:')) {
            const semidLine = line.slice(lower.indexOf('semids:') + 'semids:'.length)
            semids = [...semids, ...semidLine.split(', ').map((sem) => sem.trim())]
        }
        // handle tags in comments (e.g. # tags: tag1, tag2)
        else if (lower.includes('tags:')) {
            const tagLine = line.slice(lower.indexOf('tags:') + 'tags:'.length)
            tags = [...tags, ...tagLine.split(', ').map((tag) => tag.trim())]
        }
        // handle comment lines that have 'comment:'
        else if (lower.includes('comment:')) {
            const commentLine = line.slice(lower.indexOf('comment:') + 'comment:'.length)
            comments = [...comments, commentLine.trim()]
        }
        else {
            comments = [...comments, line.replace('#', '').trim()]
        }
    }

    return { semids, tags, comments }

}


const parse_txt = (filename: string, contents: string, obsid: number) => {
    let tgts = [] as UploadedTarget[]
    let commentLines: string[] = []
    contents.split(/\r\n|\n/).forEach((row) => {
        if (row.startsWith('#')) {
            commentLines.push(row)
            return //skip comments
        }
        if (row.trim() === '' || !row) return //whitespace rows are ignored
        const [target_name, tail] = split_at(TARGET_NAME_LENGTH_PADDED, row)
        const tailParts = tail.trimStart().replace(/\s\s+/g, ' ').split(' ')
        if (tailParts.length < 7) {
            console.warn('invalid starlist row (expected name, ra, dec, equinox)', row)
            commentLines = []
            return
        }
        let [rah, ram, ras, dech, decm, decs, equinox, ...opts] = tailParts
        console.log(`tail:${tail}`, 'ras', ras, 'decs', decs)
        console.log('rah', rah, 'ram', ram, 'ras', ras, 'dech', dech, 'decm', decm, 'decs', decs)
        ras = ras.split('.')[0].padStart(2, '0') + '.' + (ras.split('.')[1] ?? '0')
        decs = decs.split('.')[0].padStart(2, '0') + '.' + (decs.split('.')[1] ?? '0')
        const ra = `${pad_signed_digits(rah, 2)}:${ram.padStart(2, '0')}:${ras}`
        const dec = `${pad_signed_digits(dech, 2)}:${decm.padStart(2, '0')}:${decs}`
        const coordValid = ra.match(targetProps.ra.pattern as string) && dec.match(targetProps.dec.pattern as string)
        if (!coordValid) {
            console.warn('ra', ra, 'dec', dec)
            commentLines=[]
            return
        }
        // ignore anything after # in the row
        //inline comments are added to comments field
        const inlineCommentIdx = opts.findIndex((opt) => opt.startsWith('#'))
        if (inlineCommentIdx >= 0) {
            const comment = opts.slice(inlineCommentIdx).join(' ').replace('#', '').trim()
            opts = opts.slice(0, inlineCommentIdx)
            commentLines.push(comment) // add inline comment to comment lines so it gets added to the comment field
        }

        let tgt: UploadedTarget = {
            _id: randomId(),
            target_name: target_name.trimEnd().trimStart(),
            obsid: String(obsid),
            ra,
            ra_deg: ra_dec_to_deg(ra),
            dec_deg: ra_dec_to_deg(dec, true),
            dec,
            tags: [filename]
        };
        if (equinox) tgt.equinox = equinox
        const { semids, tags, comments } = parse_comments(commentLines)

        if (comments.length > 0) {
            tgt.comment = comments.join(', ')
        }
        if (semids.length > 0) {
            tgt.semids = semids
        }
        if (tags.length > 0) {
            tgt.tags = [...(tgt.tags as string[]), ...tags]
        }

        tgt.tags = [...new Set(tgt.tags as string[])] //unique tags

        //reset comment lines after adding them to the target so they don't get added to the next target
        commentLines = []

        opts.forEach((opt) => {
            if (!opt.includes('=')) return
            const [key, value] = opt.split('=')
            const tgtKey = Object.prototype.hasOwnProperty.call(starlistToKeyMapping, key.toLowerCase())
                ? starlistToKeyMapping[key.toLowerCase()]
                : undefined
            if (!tgtKey) {
                console.warn('invalid key', key, value, opts, row)
                return
            }
            // enum-valued fields (lgs, rotator_mode, telescope_wrap, ...) are normalized to lowercase;
            // free text fields (target name, tags, comment...) keep the case the observer wrote
            const isEnum = !!targetProps[tgtKey]?.enum
            const normalizedValue = isEnum ? value.toLowerCase() : value
            if (tgtKey === 'tags') {
                const optTags = normalizedValue.split(',').map((t) => t.trim()).filter(Boolean)
                tgt.tags = [...new Set([...(tgt.tags as string[]), ...optTags])]
            }
            else {
                //@ts-ignore
                tgt[tgtKey] = normalizedValue
            }
        })
        tgts.push(tgt);
    });
    return tgts
}

interface UploadedTarget {
    [key: string]: string | number | string[]
}

export function UploadComponent(props: UploadProps) {

    const context = useStateContext()
    const snackbarContext = useSnackbarContext()

    const [starlistNames, setStarlistNames] = React.useState<string[]>([])
    const [label, setLabel] = React.useState("Upload Targets");

    React.useEffect(() => {
        const fetchStarlistNames = async () => {
            const resp = await fetch('/api/planning_tool/getFileNamesFromStarlistDirectory')
            if (!resp.ok) {
                console.error('error fetching starlist directory', resp)
                return
            }
            const names: string[] = await resp.json()
            setStarlistNames(names)
        }
        fetchStarlistNames()
    }, [])

    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleClose = async (filename?: string) => {
        if (filename) {
            const fileresp = await fetch(`/api/planning_tool/importFileFromStarlistDirectory`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ filename: filename }),
            })
            !fileresp.ok && console.error('error importing file', filename, fileresp)
            const contents = await fileresp.text()
            handle_contents(filename, contents, 'starlisttxt')
        }
        setAnchorEl(null);
    };

    const handle_contents = (filename: string, contents: string, ext?: string) => {
        let uploadedTargets: UploadedTarget[] = []
        switch (ext) {
            case 'json':
                uploadedTargets = parse_json(filename, contents)
                break;
            case 'csv':
                uploadedTargets = parse_csv(filename, contents)
                break;
            case 'starlisttxt':
            case 'txt':
                console.log('txt', contents, context.obsid)
                uploadedTargets = parse_txt(filename, contents, context.obsid)
                break;
            default:
                snackbarContext.setSnackbarMessage({ severity: 'warning', message: 'File type may not supported. Attempting to parse as .txt' })
                snackbarContext.setSnackbarOpen(true);
                try {
                    uploadedTargets = parse_txt(filename, contents, context.obsid)
                }
                catch (e) {
                    console.error('file type not supported', e)
                    return
                }
        }
        console.log('uploaded tgts', uploadedTargets)
        const fmtTgts = format_targets(uploadedTargets, targetProps)
        const txt = `${ext === 'starlisttxt' ? 'Starlist: ' : 'Local File: '}${filename} Uploaded. (${fmtTgts.length} targets)`
        setLabel && setLabel(txt)
        props.setTargets(fmtTgts)
    };

    const localFileLoad = (evt: React.ChangeEvent<HTMLInputElement>) => {
        let file: File = new File([], 'empty')
        evt.target?.files && (file = evt.target?.files[0])
        setLabel && setLabel(`${file.name} Uploaded`)
        const ext = file.name.split('.').pop()?.toLowerCase()
        const fileReader = new FileReader()
        fileReader.readAsText(file, "UTF-8");
        fileReader.onload = e => {
            const contents = e.target?.result as string
            handle_contents(file.name, contents, ext)
        };
        evt.target.value = '' // allow re-selecting the same file to fire onChange again
    };

    return (
        <Stack direction="column" spacing={2} alignItems="flex-start">
            <Stack direction="row" spacing={2} alignItems="center">
                <input
                    // accept="*.json,*.txt" // prefer .json but .txt is ok too
                    style={{ display: 'none' }}
                    id="target-file-input"
                    type="file"
                    onChange={localFileLoad}
                />
                <label htmlFor="target-file-input">
                    <Button id={'load-target-file'} variant="outlined" component="span" color="primary" >
                        Load from Local File
                    </Button>
                </label>
                <Button
                    id="starlist-button"
                    aria-controls={open ? 'starlist-menu' : undefined}
                    aria-haspopup="true"
                    variant='outlined'
                    aria-expanded={open ? 'true' : undefined}
                    onClick={handleClick}
                >
                    From Starlist Directory
                </Button>
                <Menu
                    id="starlist-menu"
                    aria-labelledby="starlist-button"
                    anchorEl={anchorEl}
                    open={open}
                    onClose={() => handleClose()}
                    anchorOrigin={{
                        vertical: 'top',
                        horizontal: 'left',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'left',
                    }}
                >
                    {starlistNames.map(name => (
                        <MenuItem key={name} onClick={() => handleClose(name)}>{name}</MenuItem>
                    ))}
                </Menu>
            </Stack>
            <Typography variant="body2" color="text.secondary">
                {label}
            </Typography>
        </Stack>
    )
}

export default function UploadDialog(props: Props) {
    const [open, setOpen] = React.useState(false);

    const handleClickOpen = () => {
        setOpen(true);
    };


    const handleClose = () => {
        setOpen(false);
    };

    const titleContent = (
        <div>
            {"Upload Targets from .json, or .txt file"}
        </div>
    )

    const dialogContent = (
        <DialogContentText id="alert-dialog-description">
            Select the file to upload
        </DialogContentText>
    )

    const dialogActions = (
        <UploadComponent
            setOpen={setOpen}
            setTargets={props.setTargets} 
        />
    )

    return (
        <>
            <Tooltip title="Upload Targets from .json or .txt file">
                <Button onClick={handleClickOpen} startIcon={<UploadIcon />}>
                    {'Set Targets'}
                </Button>
            </Tooltip>
            <DialogComponent
                open={open}
                handleClose={handleClose}
                titleContent={titleContent}
                children={dialogContent}
                actions={dialogActions}
            />
        </>
    );
}
