"""Refresh the small reviewed site list from canonical Pleiades JSON records.

Names were selected using the Pleiades name index. Coordinates are copied, never
inferred. The Egypt extent is a validation guard, not a historical boundary.
"""
import concurrent.futures
import datetime
import json
import pathlib
import subprocess

SITES = {
    'Abydos': '756512', 'Amarna': '149576487', 'Hierakonpolis': '786037',
    'Memphis': '736963', 'Saqqara': '796289136', 'Giza': '442962448',
    'Thebes': '786017', 'Karnak': '786050', 'Elephantine': '786021',
    'Philae': '786089', 'Edfu': '785974', 'Dendera': '786127', 'Esna': '786059',
    'Kom Ombo': '786079', 'Alexandria': '727070', 'Tanis': '727236',
    'Bubastis': '727088', 'Sais': '727217', 'Heliopolis': '727117',
    'Hermopolis Magna': '756574', 'Antinoopolis': '756518', 'Oxyrhynchus': '736983',
    'Hawara': '736918', 'Lahun': '736953', 'Deir el-Medina': '864388873',
}

def fetch(item):
    label, identifier = item
    source = f'https://pleiades.stoa.org/places/{identifier}'
    raw = json.loads(subprocess.check_output(['curl', '-f', '-sS', '-L', '--max-time', '30', source + '/json']))
    lon, lat = raw['reprPoint']
    if not (23 <= lat <= 33 and 25 <= lon <= 36):
        raise ValueError(f'{label} coordinates outside expected Egypt extent: {lon}, {lat}')
    aliases = sorted({label, *[(name.get('attested') or '') for name in raw.get('names', [])] } - {''})
    return dict(id=identifier, name=label, sourceTitle=raw['title'], longitude=lon, latitude=lat, aliases=aliases, source=source)

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        sites = list(pool.map(fetch, SITES.items()))
    result = dict(source='Pleiades', attribution='Pleiades contributors; Ancient World Mapping Center and Institute for the Study of the Ancient World', license='CC BY 3.0', licenseURL='https://creativecommons.org/licenses/by/3.0/', retrievedAt=datetime.date.today().isoformat(), sites=sites)
    pathlib.Path(__file__).resolve().parent.parent.joinpath('data/sites.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Validated and wrote {len(sites)} Pleiades places')
