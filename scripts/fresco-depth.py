# The fresco's depth, for scripts/bake-fresco-chunks.mjs. Run once:
#
#   python3 -P scripts/fresco-depth.py <creation.jpg> <model.onnx> scripts/fresco-src public/models/fresco
#
# <creation.jpg>: Wikimedia Commons "Michelangelo - Creation of Adam (cropped).jpg"
#   (public domain, 3524x1599).
# <model.onnx>: Depth Anything V2 small, onnx-community/depth-anything-v2-small
#   on Hugging Face (onnx/model.onnx, Apache-2.0).
#
# Writes: scripts/fresco-src/depth16.raw + depth16.json (the relief the bake
# displaces, 1024 wide, uint16, 0 = the wall, 65535 = nearest), and
# public/models/fresco/fresco.jpg + depth.jpg (2048 wide: what the page
# shades the stone with). The depth is the model's relative inverse depth,
# normalised and raised to 1.25 so the figures stand proud of a flat wall.
import json, sys
import numpy as np
import onnxruntime as ort
from PIL import Image

src, model, bake_dir, pub_dir = sys.argv[1:5]
im = Image.open(src).convert("RGB")
W, H = im.size
tw = 1036
th = int(round(tw * H / W / 14)) * 14
x = np.asarray(im.resize((tw, th), Image.BICUBIC)).astype(np.float32) / 255.0
x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
x = x.transpose(2, 0, 1)[None]
sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
y = np.squeeze(sess.run(None, {sess.get_inputs()[0].name: x})[0]).astype(np.float32)
d = np.asarray(Image.fromarray(y).resize((W, H), Image.BICUBIC), np.float32)
p = ((d - d.min()) / (d.max() - d.min() + 1e-9)) ** 1.25

TW = 2048
TH = int(round(TW * H / W))
im.resize((TW, TH), Image.LANCZOS).save(f"{pub_dir}/fresco.jpg", quality=86, optimize=True)
Image.fromarray((p * 255).astype(np.uint8)).resize((TW, TH), Image.LANCZOS).save(f"{pub_dir}/depth.jpg", quality=90, optimize=True)
BW = 1024
BH = int(round(BW * H / W))
b = np.asarray(Image.fromarray(p.astype(np.float32)).resize((BW, BH), Image.BILINEAR), np.float32)
(np.clip(b, 0, 1) * 65535).astype("<u2").tofile(f"{bake_dir}/depth16.raw")
json.dump({"width": BW, "height": BH, "aspect": W / H}, open(f"{bake_dir}/depth16.json", "w"))
print("wrote", TW, TH, "bake grid", BW, BH, "aspect", W / H)
