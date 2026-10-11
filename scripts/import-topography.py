"""Import selected themes from Lantmäteriet's nested Topografi ZIP exports.
Run through npm run import:topography so the configured Python is used.
"""
import argparse
from contextlib import closing
import io
import json
import math
import pathlib
import shutil
import sqlite3
import tempfile
import zipfile
from shapely import wkb
from shapely.geometry import mapping
from shapely.ops import transform
from pyproj import Transformer

PROJECT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--zip', required=True, type=pathlib.Path)
parser.add_argument('--scale', required=True, choices=['100', '250', '1m'])
parser.add_argument('--theme', choices=['administrativindelning', 'kommunikation', 'hydrografi'], action='append')
parser.add_argument('--cache-dir', type=pathlib.Path, default=PROJECT/'.gev-cache/topography')
parser.add_argument('--extract-dir', type=pathlib.Path, default=PROJECT/'work/topography')
args = parser.parse_args()
if not args.zip.is_file():
    parser.error('ZIP-arkivet saknas. Ange den nedladdade Topografi-exporten med --zip.')
args.extract_dir.mkdir(parents=True, exist_ok=True)
convert = Transformer.from_crs(3006, 4326, always_xy=True).transform
tables = ['administrativ_grans', 'vaglinje', 'ovrig_vag', 'ralstrafik', 'farjeled', 'hydrolinje']
with zipfile.ZipFile(args.zip) as outer:
    for theme in args.theme or ['administrativindelning', 'kommunikation', 'hydrografi']:
        nested = next((n for n in outer.namelist() if pathlib.PurePosixPath(n).name == theme+'_sverige.zip'), None)
        if nested is None:
            raise ValueError('Temat '+theme+' saknas i exporten.')
        target = args.extract_dir/(args.scale+'-'+theme+'.gpkg')
        with zipfile.ZipFile(io.BytesIO(outer.read(nested))) as inner:
            files = [n for n in inner.namelist() if n.lower().endswith('.gpkg')]
            if len(files) != 1:
                raise ValueError('Förväntade exakt en GeoPackage för '+theme)
            with inner.open(files[0]) as src, target.with_suffix('.tmp').open('wb') as dst:
                shutil.copyfileobj(src, dst)
            target.with_suffix('.tmp').replace(target)
        tiles = {}
        count = 0
        with closing(sqlite3.connect(target.resolve().as_uri()+'?mode=ro', uri=True)) as db:
            for table, col, srs in db.execute('select table_name,column_name,srs_id from gpkg_geometry_columns'):
                if table not in tables:
                    continue
                if srs != 3006:
                    raise ValueError('Förväntade SWEREF 99 TM (EPSG:3006); fick '+str(srs))
                # Column names originate in the GeoPackage schema, quote defensively.
                quote = lambda value: '"'+value.replace('"','""')+'"'
                for idx, (blob,) in enumerate(db.execute('select '+quote(col)+' from '+quote(table))):
                    if not blob:
                        continue
                    offset = 8+{0:0,1:32,2:48,3:48,4:64}[(blob[3]>>1)&7]
                    geometry = wkb.loads(blob[offset:]).simplify({'1m':100,'250':40,'100':20}[args.scale], preserve_topology=True)
                    if geometry.is_empty:
                        continue
                    geometry = transform(convert, geometry)
                    bounds = geometry.bounds
                    feature = {'type':'Feature','id':table+':'+str(idx),'properties':{'typ':table},'geometry':mapping(geometry),'bbox':bounds}
                    for x in range(math.floor(bounds[0]/2), math.floor(bounds[2]/2)+1):
                        for y in range(math.floor(bounds[1]/2), math.floor(bounds[3]/2)+1):
                            tiles.setdefault(str(x)+'_'+str(y), []).append(feature)
                    count += 1
        folder = args.cache_dir/args.scale/theme
        folder.parent.mkdir(parents=True, exist_ok=True)
        # Stage a complete theme before replacing it, so failed imports preserve old data.
        with tempfile.TemporaryDirectory(prefix='topography-', dir=folder.parent) as staging:
            staged = pathlib.Path(staging)/'data'
            staged.mkdir()
            for key, rows in tiles.items():
                (staged/(key+'.json')).write_text(json.dumps(rows,separators=(',',':')),encoding='utf8')
            (staged/'manifest.json').write_text(json.dumps({'version':1,'scale':args.scale,'theme':theme,'features':count,'tiles':list(tiles),'crs':'EPSG:4326'}),encoding='utf8')
            backup = pathlib.Path(staging)/'previous'
            if folder.exists():
                folder.rename(backup)
            try:
                staged.rename(folder)
            except BaseException:
                if backup.exists(): backup.rename(folder)
                raise
        print(args.scale, theme, count, 'features; GeoPackage:', target, flush=True)
