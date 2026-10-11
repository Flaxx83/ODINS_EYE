"""Offline integration tests for actual GeoPackage/ZIP import and rail build."""
import io
import json
import pathlib
import pickle
import sqlite3
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
from shapely.geometry import LineString

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='odins-geodata-')
        self.folder = pathlib.Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, srs=3006):
        dbfile = self.folder/'fixture.gpkg'
        if dbfile.exists(): dbfile.unlink()
        with sqlite3.connect(dbfile) as db:
            db.execute('create table gpkg_geometry_columns(table_name text,column_name text,srs_id integer)')
            db.execute('insert into gpkg_geometry_columns values ("ralstrafik","geom",?)',(srs,))
            db.execute('create table ralstrafik(geom blob,objekttyp text,under_byggnad text)')
            geometry = LineString([(440000,6470000),(440100,6470000),(440200,6470010)])
            blob = b'GP'+bytes([0,1])+struct.pack('<i',srs)+geometry.wkb
            db.execute('insert into ralstrafik values (?,"Järnväg","Nej")',(blob,))
        db.close()
        inner = io.BytesIO()
        with zipfile.ZipFile(inner,'w') as archive: archive.writestr('fixture.gpkg',dbfile.read_bytes())
        outer = self.folder/'export.zip'
        with zipfile.ZipFile(outer,'w') as archive: archive.writestr('kommunikation_sverige.zip',inner.getvalue())
        return outer

    def run_import(self, archive):
        return subprocess.run([sys.executable,str(ROOT/'scripts/import-topography.py'),'--zip',str(archive),'--scale','100','--theme','kommunikation','--cache-dir',str(self.folder/'tiles'),'--extract-dir',str(self.folder/'extracted')],capture_output=True,text=True)

    def test_reimport_projection_and_rail_graph(self):
        archive = self.archive()
        result = self.run_import(archive)
        self.assertEqual(result.returncode,0,result.stderr)
        folder = self.folder/'tiles/100/kommunikation'
        manifest = json.loads((folder/'manifest.json').read_text())
        self.assertEqual(manifest['features'],1)
        features = json.loads((folder/(manifest['tiles'][0]+'.json')).read_text())
        lon,lat = features[0]['geometry']['coordinates'][0]
        self.assertTrue(10 < lon < 20 and 55 < lat < 65)
        (folder/'999_999.json').write_text('[]')
        result = self.run_import(archive)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse((folder/'999_999.json').exists(),'Obsolete tiles must not survive a completed replacement')
        graphfile = self.folder/'graph.pkl'
        result = subprocess.run([sys.executable,str(ROOT/'server/providers/rail-routing/build.py'),'--gpkg',str(self.folder/'extracted/100-kommunikation.gpkg'),'--output',str(graphfile)],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        with graphfile.open('rb') as source: graph = pickle.load(source)
        self.assertGreaterEqual(len(graph),3)

    def test_wrong_crs_preserves_previous_tiles(self):
        self.assertEqual(self.run_import(self.archive()).returncode,0)
        manifest = self.folder/'tiles/100/kommunikation/manifest.json'
        previous = manifest.read_bytes()
        result = self.run_import(self.archive(srs=4326))
        self.assertNotEqual(result.returncode,0)
        self.assertIn('EPSG:3006',result.stderr)
        self.assertEqual(manifest.read_bytes(),previous)


if __name__ == '__main__': unittest.main()
