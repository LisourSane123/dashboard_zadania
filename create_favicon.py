"""Run once to create static/favicon.ico"""
import struct, zlib, os

png_sig = b'\x89PNG\r\n\x1a\n'
ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0)
ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
raw = zlib.compress(b'\x00\x00\x00\x00\x00', 9)
idat_crc = zlib.crc32(b'IDAT' + raw) & 0xffffffff
idat = struct.pack('>I', len(raw)) + b'IDAT' + raw + struct.pack('>I', idat_crc)
iend_crc = zlib.crc32(b'IEND') & 0xffffffff
iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
png = png_sig + ihdr + idat + iend

ico_header = struct.pack('<HHH', 0, 1, 1)
ico_entry = struct.pack('<BBBBHHII', 1, 1, 0, 0, 1, 32, len(png), 22)
ico = ico_header + ico_entry + png

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "favicon.ico")
with open(path, 'wb') as f:
    f.write(ico)
print(f"Created {path} ({len(ico)} bytes)")
