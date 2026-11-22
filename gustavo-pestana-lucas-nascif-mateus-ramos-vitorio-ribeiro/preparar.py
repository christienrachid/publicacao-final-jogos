"""Prepara os recursos de Ultima Vigilia usando apenas a biblioteca padrao."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def obtain(resource, local=None):
    target = Path(local).resolve() if local else ROOT / resource['arquivo']
    if local and not target.is_file():
        raise FileNotFoundError(target)
    if not target.exists():
        partial = target.with_name(target.name + '.part')
        print('Baixando', resource['arquivo'], flush=True)
        request = Request(resource['url'], headers={'User-Agent': 'Ultima-Vigilia-Entrega'})
        with urlopen(request, timeout=60) as response, partial.open('wb') as output:
            last = -1
            total = 0
            while block := response.read(1024 * 1024):
                output.write(block)
                total += len(block)
                step = int(total * 10 / resource['bytes'])
                if step != last:
                    print(f'  {min(100, step * 10)}%', flush=True)
                    last = step
        if partial.stat().st_size != resource['bytes'] or digest(partial) != resource['sha256']:
            raise ValueError(f'Arquivo incompleto ou diferente do esperado: {partial.name}')
        partial.replace(target)
    elif target.stat().st_size != resource['bytes'] or digest(target) != resource['sha256']:
        raise ValueError(f'Arquivo diferente do esperado: {target.name}. Confira recursos.json.')
    print('SHA-256 conferido:', target.name, flush=True)
    return target


def extract_media(archive):
    with ZipFile(archive) as package:
        entries = []
        for member in package.infolist():
            relative = Path(member.filename)
            destination = (ROOT / relative).resolve()
            if (relative.is_absolute() or not destination.is_relative_to(ROOT)
                    or not relative.parts or relative.parts[0] not in ('images', 'files')
                    or (member.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Caminho inesperado no pacote: ' + member.filename)
            entries.append((member, destination))
        for member, destination in entries:
            if member.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with package.open(member) as source, destination.open('wb') as output:
                    shutil.copyfileobj(source, output)
    print(f'{len(entries)} recursos preparados.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--construct', action='store_true', help='Baixa o projeto editavel .c3p.')
    parser.add_argument('--midia-local', type=Path, help='Usa um pacote de midia ja baixado.')
    options = parser.parse_args()
    resources = json.loads((ROOT / 'recursos.json').read_text(encoding='utf-8'))
    if options.construct:
        obtain(resources['construct'])
        print('Abra o .c3p no Construct 3 por Menu > Abrir > Arquivo.')
    else:
        extract_media(obtain(resources['midia'], options.midia_local))
        print('Execute: python -m http.server 8000 --bind 127.0.0.1')
        print('Depois abra http://127.0.0.1:8000/ no navegador.')


if __name__ == '__main__':
    main()
