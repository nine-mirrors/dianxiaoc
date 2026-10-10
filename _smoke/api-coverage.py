"""前后端接口覆盖度核查：前端调用的路径 vs 后端已注册路由。"""
import re
import io

FE = 'store-app/src/api/index.ts'
BE = 'server/src/index.js'

fe_src = io.open(FE, encoding='utf-8').read()
be_src = io.open(BE, encoding='utf-8').read()

# 前端：path: '...' 与 path: `...`
fe_paths = set()
for pat in (r"path:\s*'([^']+)'", r"path:\s*`([^`]+)`"):
    fe_paths.update(re.findall(pat, fe_src))
# 流式端点
sse_paths = set(re.findall(r"streamSse\(\s*'([^']+)'", fe_src))

# 后端路由
routes = []
for m in re.finditer(r"app\.(get|post|patch|delete)\(\s*'([^']+)'", be_src):
    routes.append((m.group(1).upper(), m.group(2)))


def norm(p):
    """把 ${id} / :id 统一成 :x，便于匹配。"""
    p = re.sub(r'\$\{[^}]+\}', ':x', p)
    p = re.sub(r':[A-Za-z_]\w*', ':x', p)
    return p


be_norm = {(m, norm(p)) for m, p in routes}
be_all_norm = {p for _, p in be_norm}

# 逐个前端路径找匹配（GET 之外的按同路径任意方法匹配）
missing = []
covered = []
for p in sorted(fe_paths | sse_paths):
    pn = norm(p)
    hit = None
    for m, bp in be_norm:
        if bp == pn:
            hit = m
            break
    if hit:
        covered.append((p, hit))
    else:
        missing.append(p)

print('=' * 56)
print(f'后端已注册路由：{len(routes)} 条')
print(f'前端调用端点：{len(fe_paths | sse_paths)} 个')
print('=' * 56)
print('\n【已覆盖】')
for p, m in covered:
    print(f'  ✅ {m:6} {p}')

if missing:
    print('\n【❗后端缺失】')
    for p in missing:
        print(f'  ❌ {p}')
else:
    print('\n【❗后端缺失】无 —— 前端所有调用都有对应后端实现')

# 后端有但前端没用的（提示冗余，不算问题）
used_norm = {norm(p) for p in (fe_paths | sse_paths)}
unused = sorted(p for p in be_all_norm if p not in used_norm)
print('\n【后端有、前端未调用（仅提示）】')
for p in unused:
    print(f'  · {p}')
