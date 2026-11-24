"""Build data/places.json from the Pleiades bulk dumps.

Input: the weekly places and names CSV dumps at https://atlantides.org/downloads/pleiades/dumps/.
Places with a representative point inside Egypt are kept if at least one feature type is a
site-like type. Coordinates are copied, never inferred. A name is used for matching publication
text only if it passes the rules below; every other name stays searchable but never matches.

    python3 scripts/build-gazetteer.py            # build from the cached dumps, downloading if absent
    python3 scripts/build-gazetteer.py --refresh  # download the dumps again first
    python3 scripts/build-gazetteer.py --review   # also print the names the rules accept, for review
"""
import argparse
import csv
import datetime
import gzip
import hashlib
import json
import pathlib
import re
import shutil
import unicodedata
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'pleiades'
DUMPS = 'https://atlantides.org/downloads/pleiades/dumps/'
FILES = {'places': 'pleiades-places-latest.csv.gz', 'names': 'pleiades-names-latest.csv.gz'}

# Reviewed starting points. The label is what the app shows; the aliases come from the name policy.
FEATURED = {
    '756512': 'Abydos', '149576487': 'Amarna', '786037': 'Hierakonpolis',
    '736963': 'Memphis', '796289136': 'Saqqara', '442962448': 'Giza',
    '786017': 'Thebes', '786050': 'Karnak', '786021': 'Elephantine',
    '786089': 'Philae', '785974': 'Edfu', '786127': 'Dendera', '786059': 'Esna',
    '786079': 'Kom Ombo', '727070': 'Alexandria', '727236': 'Tanis',
    '727088': 'Bubastis', '727217': 'Sais', '727117': 'Heliopolis',
    '756574': 'Hermopolis Magna', '756518': 'Antinoopolis', '736983': 'Oxyrhynchus',
    '736918': 'Hawara', '736953': 'Lahun', '864388873': 'Deir el-Medina',
}

# Pleiades feature types grouped into the categories people filter by. Types not listed here
# (roads, provinces, rivers, labels, peoples, regions) do not describe a site and are dropped.
CATEGORIES = {
    'settlement': ('Settlement or town', ['settlement', 'settlement-modern', 'fortified-settlement']),
    'sacred': ('Temple or sanctuary', ['temple', 'temple-2', 'sanctuary']),
    'burial': ('Cemetery, tomb or pyramid', ['cemetery', 'tomb', 'pyramid']),
    'christian': ('Church or monastery', ['church', 'church-2', 'monastery', 'abbey']),
    'fort': ('Fort or road station', ['fort', 'fort-2', 'station']),
    'extraction': ('Quarry or mine', ['quarry', 'mine-2']),
    'other': ('Other site', ['archaeological-site', 'island', 'oasis', 'port', 'monument',
                              'architecturalcomplex', 'well', 'dam', 'bath', 'ruin', 'findspot',
                              'production', 'mountain']),
}
TYPE_TO_CATEGORY = {t: key for key, (_, types) in CATEGORIES.items() for t in types}

# Pleiades period keys grouped to the periods Egyptian archaeology uses.
PERIODS = {
    'pharaonic': 'Pharaonic',
    'ptolemaic': 'Ptolemaic',
    'roman': 'Roman',
    'late-antique': 'Late antique',
    'islamic-modern': 'Islamic and modern',
}
PHARAONIC = ('predynastic', 'early-dynastic', 'old-kingdom', 'first-intermediate', 'middle-kingdom',
             'second-intermediate', 'new-kingdom', 'third-intermediate', 'late-period', 'archaic',
             'classical')


def period_of(key):
    if key.startswith(PHARAONIC) or key in ('1200-bc-middle-east',):
        return 'pharaonic'
    if key.startswith(('ptolemaic', 'macedonian', 'hellenistic')):
        return 'ptolemaic'
    if key.startswith('late-antique') or 'late-antique' in key:
        return 'late-antique'
    if key.startswith(('roman', 'transition-roman')) or 'roman' in key:
        return 'roman'
    if key:
        return 'islamic-modern'
    return None


def inside_egypt(lat, lon):
    """Approximate modern Egypt. A validation guard, not a historical or modern boundary."""
    if not (22.0 <= lat <= 31.7 and 25.0 <= lon <= 36.9):
        return False
    if lat < 25:
        return True
    if lat <= 29.49:
        return lon <= 34.92
    # The Sinai border runs from Taba (34.89, 29.49) to Rafah (34.27, 31.22).
    return lon <= 34.89 - (min(lat, 31.22) - 29.49) * 0.358


def is_latin(text):
    return all(ch in " -'’‘ʿʾ.," or ch.isalpha() and 'LATIN' in unicodedata.name(ch, '') for ch in text)


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn')


def fetch(name, refresh):
    target = CACHE / FILES[name]
    if refresh or not target.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(DUMPS + FILES[name], headers={'User-Agent': 'medjat-gazetteer-build'})
        with urllib.request.urlopen(request, timeout=120) as response, open(target, 'wb') as out:
            shutil.copyfileobj(response, out)
    return target


def rows(path):
    csv.field_size_limit(10 ** 9)
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as handle:
        yield from csv.DictReader(handle)


def digest(*paths):
    sha = hashlib.sha256()
    for path in paths:
        sha.update(path.read_bytes())
    return sha.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--review', action='store_true')
    args = parser.parse_args()
    policy = json.loads((ROOT / 'data/place-name-policy.json').read_text())
    places_path, names_path = fetch('places', args.refresh), fetch('names', args.refresh)

    everything = {}
    for row in rows(places_path):
        everything[row['id']] = row
    egypt = {}
    for pid, row in everything.items():
        try:
            lat, lon = float(row['reprLat']), float(row['reprLong'])
        except ValueError:
            continue
        categories = sorted({TYPE_TO_CATEGORY[t.strip()] for t in row['featureTypes'].split(',') if t.strip() in TYPE_TO_CATEGORY})
        if inside_egypt(lat, lon) and (categories or pid in FEATURED):
            egypt[pid] = dict(row, lat=lat, lon=lon, categories=categories)
    missing = set(FEATURED) - set(egypt)
    if missing:
        raise ValueError(f'Reviewed places are missing from the dump or outside the Egypt extent: {sorted(missing)}')

    variants = {}
    world = {}
    for row in rows(names_path):
        pid = row['pid'].rsplit('/', 1)[-1]
        for field in ('nameTransliterated', 'nameAttested'):
            for value in (row[field] or '').split(','):
                value = unicodedata.normalize('NFC', value.strip())
                if not value:
                    continue
                world.setdefault(fold(value), set()).add(pid)
                if pid in egypt:
                    variants.setdefault(pid, set()).add(value)
    for pid, row in everything.items():
        for part in row['title'].split('/'):
            if part.strip():
                world.setdefault(fold(part.strip()), set()).add(pid)

    stop = {fold(name) for name in policy['notPlaceNames']}
    places, accepted = [], []
    for pid, row in sorted(egypt.items(), key=lambda item: int(item[0])):
        title = unicodedata.normalize('NFC', row['title'].strip())
        names = {title, *(part.strip() for part in title.split('/')), *variants.get(pid, ())}
        names = {name for name in names if name}
        if pid in FEATURED:
            label = FEATURED[pid]
            reviewed = policy['sites'][pid]
            absent = [alias for alias in reviewed if alias not in names]
            if absent:
                raise ValueError(f'{label}: reviewed names absent from the Pleiades dump: {absent}')
            match = sorted({label, *reviewed})
        else:
            label = title
            match = sorted(
                name for name in names
                if len(name) >= 5 and is_latin(name) and fold(name) not in stop
                and world.get(fold(name), {pid}) == {pid}
            )
        outside = [name for name in match if world.get(fold(name), set()) - set(egypt)]
        record = dict(id=pid, name=label, latitude=round(row['lat'], 5), longitude=round(row['lon'], 5))
        record['types'] = row['categories']
        periods = sorted({p for key in row['timePeriodsKeys'].split(',') if (p := period_of(key.strip()))}, key=list(PERIODS).index)
        if periods:
            record['periods'] = periods
        if row['locationPrecision'] in ('rough', 'related'):
            record['precision'] = row['locationPrecision']
        tags = row['tags']
        if pid in FEATURED:
            record['featured'] = True
        if 'dare:major=1' in tags or 'major settlement' in tags or 'major fort' in tags or pid in FEATURED:
            record['major'] = True
        if outside:
            record['shared'] = True
        record['match'] = match
        record['otherNames'] = sorted(name for name in names if name not in match and is_latin(name))
        places.append(record)
        if args.review and pid not in FEATURED:
            accepted.extend(match)

    result = dict(
        source='Pleiades',
        attribution='Pleiades contributors; Ancient World Mapping Center and Institute for the Study of the Ancient World',
        license='CC BY 3.0',
        licenseURL='https://creativecommons.org/licenses/by/3.0/',
        retrievedAt=datetime.date.fromtimestamp(places_path.stat().st_mtime).isoformat(),
        namesReviewedAt=policy['reviewedAt'],
        sourceSHA256=digest(places_path, names_path),
        namePolicy=policy['policy'],
        types={key: label for key, (label, _) in CATEGORIES.items()},
        periods=PERIODS,
        count=len(places),
    )
    lines = ',\n'.join(json.dumps(place, ensure_ascii=False, separators=(',', ':')) for place in places)
    head = json.dumps(result, ensure_ascii=False, indent=2)[:-2]
    (ROOT / 'data/places.json').write_text(f'{head},\n  "places": [\n{lines}\n  ]\n}}\n')
    print(f'Wrote {len(places)} Pleiades places ({sum(1 for p in places if p["match"])} can match publication text)')
    if args.review:
        print('\n'.join(sorted(set(accepted), key=str.lower)))


if __name__ == '__main__':
    main()
