import urllib.request
import json
import os

def main():
    url = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
    dest_path = "nj_counties.geojson"
    
    print(f"Downloading county GeoJSON from {url}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error downloading: {e}")
        return

    print("Filtering for New Jersey counties (FIPS 34001 - 34041)...")
    nj_features = []
    for feature in data.get('features', []):
        fips = feature.get('id') or feature.get('properties', {}).get('fips')
        if fips:
            try:
                fips_val = int(fips)
                if 34001 <= fips_val <= 34041:
                    properties = feature.get('properties', {})
                    name = properties.get('name')
                    print(f"  Found NJ county: {name} (FIPS {fips})")
                    nj_features.append(feature)
            except ValueError:
                continue

    nj_geojson = {
        "type": "FeatureCollection",
        "features": nj_features
    }

    print(f"Writing {len(nj_features)} features to {dest_path}...")
    with open(dest_path, 'w', encoding='utf-8') as f:
        json.dump(nj_geojson, f, indent=2)
    print("GeoJSON filtering complete!")

if __name__ == "__main__":
    main()
