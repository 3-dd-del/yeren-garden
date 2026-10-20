import bpy
import math
import os
import random
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
os.makedirs(ASSETS, exist_ok=True)
random.seed(42)

# Build a clean, editable scene for a single illustrative campus courtyard.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != "Collection":
        bpy.data.collections.remove(collection)

scene = bpy.context.scene
root_collection = bpy.data.collections.get("Collection")
if root_collection:
    root_collection.name = "青禾校园主庭"

COLLECTIONS = {}
for name in ("01 建筑", "02 庭院与铺装", "03 植物", "04 灯光与摄影机"):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    COLLECTIONS[name] = collection


def place_in(obj, collection_name):
    collection = COLLECTIONS[collection_name]
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def rgb(hex_value):
    value = hex_value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def make_material(name, color, roughness=0.78, metallic=0.0, emission=None):
    material = bpy.data.materials.new(name=name)
    base = rgb(color) if isinstance(color, str) else color
    material.diffuse_color = (*base, 1.0)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    shader = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    shader.inputs["Base Color"].default_value = (*base, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        emission_color, strength = emission
        color_socket = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
        strength_socket = shader.inputs.get("Emission Strength")
        if color_socket:
            e = rgb(emission_color) if isinstance(emission_color, str) else emission_color
            color_socket.default_value = (*e, 1.0)
        if strength_socket:
            strength_socket.default_value = strength
    return material


wall = make_material("外墙｜暮光石灰", "#A7A193", roughness=0.86)
wall_shadow = make_material("外墙｜阴影面", "#77766F", roughness=0.9)
stone = make_material("台基｜烟灰石材", "#64686A", roughness=0.9)
roof = make_material("屋面｜深灰瓦", "#292D33", roughness=0.78)
roof_edge = make_material("檐口｜炭黑木", "#353032", roughness=0.84)
timber = make_material("木构｜深红棕", "#553D35", roughness=0.77)
window_glow = make_material("窗内｜暖光", "#8F5331", roughness=0.28, emission=("#FFAE66", 1.15))
window_dim = make_material("窗面｜暮色反射", "#252D36", roughness=0.32, metallic=0.12)
door = make_material("入口｜深色木门", "#342B29", roughness=0.69)
grass = make_material("庭院｜暗绿草地", "#34433B", roughness=0.98)
path_mats = [
    make_material("铺装｜暖灰石板", "#77736D", roughness=0.92),
    make_material("铺装｜浅灰石板", "#88837A", roughness=0.92),
    make_material("铺装｜冷灰石板", "#676C6C", roughness=0.92),
]
leaf_mats = [
    make_material("树冠｜苔绿", "#394941", roughness=0.96),
    make_material("树冠｜深松绿", "#293C39", roughness=0.96),
    make_material("树冠｜暮色橄榄", "#4B5140", roughness=0.96),
]
trunk_mat = make_material("树干｜褐灰", "#51463C", roughness=0.98)
shrub_mat = make_material("绿篱｜深叶", "#2C4038", roughness=0.98)
floor_mat = make_material("内部｜橡木地板", "#B09874", roughness=.84)
partition_mat = make_material("内部｜浅色隔墙", "#B9B4A5", roughness=.88)
furniture_mat = make_material("内部｜木质桌架", "#916D4C", roughness=.68)
seat_mat = make_material("内部｜织物坐垫", "#526D65", roughness=.9)
book_mats = [make_material("内部｜书脊" + str(i), color) for i, color in enumerate(["#6F7E82", "#AB795D", "#B9A585", "#637267"])]
light_stem = make_material("庭灯｜深色金属", "#33363A", roughness=0.42, metallic=0.55)
light_glow = make_material("庭灯｜暖色灯罩", "#D49658", roughness=0.3, emission=("#FFB66D", 1.8))


CURRENT_LAYER = "structure"
CUBE_VERTICES = [(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
CUBE_FACES = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]


def cube(name,location,dimensions,material,collection="01 建筑"):
    mesh=bpy.data.meshes.new(name+"Mesh")
    mesh.from_pydata([(x*dimensions[0],y*dimensions[1],z*dimensions[2]) for x,y,z in CUBE_VERTICES],[],CUBE_FACES)
    mesh.update()
    if material:mesh.materials.append(material)
    obj=bpy.data.objects.new(name,mesh)
    obj.location=location
    obj["layer"]=CURRENT_LAYER
    COLLECTIONS[collection].objects.link(obj)
    return obj


def mesh_object(name, vertices, faces, material, collection="01 建筑"):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    COLLECTIONS[collection].objects.link(obj)
    return obj


def gable_triangle(name, cx, y, width, eaves_z, peak_z, material):
    x0 = cx - width / 2
    x1 = cx + width / 2
    mesh_object(name,
        [(x0, y, eaves_z), (x1, y, eaves_z), (cx, y, peak_z)],
        [(0, 1, 2)], material)


def roof_slope(name, x0, x1, y0, y1, z0, z1, material, thickness=0.24):
    # One solid gable-roof plane, with a thin vertical edge under the dark roof.
    vertices = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z1), (x0, y1, z1),
        (x0, y0, z0 - thickness), (x1, y0, z0 - thickness),
        (x1, y1, z1 - thickness), (x0, y1, z1 - thickness),
    ]
    faces = [
        (0, 1, 2, 3), (7, 6, 5, 4),
        (0, 4, 5, 1), (1, 5, 6, 2),
        (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return mesh_object(name, vertices, faces, material)


def gable_roof(name, cx, width, front, back, eaves, peak, material):
    for side in (-1, 1):
        edge = cx + side * width / 2
        vertices = [
            (edge, front, eaves), (edge, back, eaves),
            (cx, back, peak), (cx, front, peak),
            (edge, front, eaves - 0.22), (edge, back, eaves - 0.22),
            (cx, back, peak - 0.22), (cx, front, peak - 0.22),
        ]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
                 (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        mesh_object(name + str(side), vertices, faces, material)

def cylinder(name, location, radius, depth, material, vertices=12, collection="03 植物"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    place_in(obj, collection)
    return obj


def sphere(name, location, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    place_in(obj, "03 植物")
    return obj


def window_unit(name, x, y_front, bottom, width, height, glowing=True):
    glass_mat = window_glow if glowing else window_dim
    depth = 0.095
    # Recessed warm or reflective glass, then a dark timber frame and two slender muntins.
    cube(name + "｜玻璃", (x, y_front - 0.045, bottom + height / 2), (width, depth, height), glass_mat)
    frame_y = y_front - 0.12
    frame_w = 0.10
    cube(name + "｜左框", (x - width / 2 - frame_w / 2, frame_y, bottom + height / 2), (frame_w, 0.16, height + 0.16), timber)
    cube(name + "｜右框", (x + width / 2 + frame_w / 2, frame_y, bottom + height / 2), (frame_w, 0.16, height + 0.16), timber)
    cube(name + "｜上框", (x, frame_y, bottom + height + 0.04), (width + 0.18, 0.17, 0.10), timber)
    cube(name + "｜下框", (x, frame_y, bottom - 0.04), (width + 0.18, 0.17, 0.10), timber)
    cube(name + "｜竖梃", (x, frame_y - 0.012, bottom + height / 2), (0.055, 0.18, height), timber)
    cube(name + "｜横梃", (x, frame_y - 0.012, bottom + height * 0.56), (width, 0.18, 0.06), timber)



def beam_between(name, start, end, width=.18, depth=.20, material=timber):
    start, end = Vector(start), Vector(end)
    beam = cube(name, (start+end)/2, (width, depth, (end-start).length), material)
    beam.rotation_euler = (end-start).to_track_quat("Z", "Y").to_euler()
    return beam


def facade(name, cx, cy, length, eaves, count=6, angle=0, door_index=None):
    before = set(bpy.data.objects)
    positions = [cx-length/2+1.45+i*(length-2.9)/(count-1) for i in range(count)]
    openings = [(x-.67, x+.67) for x in positions]
    # Real openings and 28 cm wall thickness, rather than an opaque solid box.
    for j, (bottom, top) in enumerate([(1.16,1.90),(4.20,5.12),(6.72,eaves)]):
        if j==0 and door_index is not None:
            dx=positions[door_index]
            for start,end in [(cx-length/2,dx-.67),(dx+.67,cx+length/2)]:
                cube(name+"｜入口低墙",((start+end)/2,cy,(bottom+top)/2),(end-start,.28,top-bottom),wall)
        else:
            cube(name+f"｜墙带{j}", (cx,cy,(bottom+top)/2), (length,.28,top-bottom), wall)
    left = cx-length/2
    for i, (a,b) in enumerate(openings + [(cx+length/2,cx+length/2)]):
        if a-left>.015:
            cube(name+f"｜墙墩{i}", ((left+a)/2,cy,(1.16+eaves)/2), (a-left,.28,eaves-1.16),wall)
        left=b
    for i,x in enumerate(positions):
        if i==door_index:
            cube(name+"｜入口门楣",(x,cy,3.80),(1.34,.28,.80),wall)
            for side in [-1,1]:
                cube(name+"｜入口门框",(x+side*.70,cy,2.28),(.09,.34,2.24),timber)
        else:
            window_unit(name+f"｜一层窗{i}",x,cy,1.9,1.34,2.3,glowing=i%3!=1)
        window_unit(name+f"｜二层窗{i}",x,cy,5.12,1.34,1.6,glowing=i%2==0)
    if angle:
        for obj in set(bpy.data.objects)-before:
            dx,dy=obj.location.x-cx,obj.location.y-cy
            obj.location.x=cx+dx*math.cos(angle)-dy*math.sin(angle)
            obj.location.y=cy+dx*math.sin(angle)+dy*math.cos(angle)
            obj.rotation_euler.z+=angle


def slab_opening(name,x0,x1,y0,y1,hx0,hx1,hy0,hy1,z):
    for i,(a,b,c,d) in enumerate([(x0,hx0,y0,y1),(hx1,x1,y0,y1),(hx0,hx1,y0,hy0),(hx0,hx1,hy1,y1)]):
        if b-a>.01 and d-c>.01:
            cube(name+f"｜楼板分区{i}",((a+b)/2,(c+d)/2,z-.1),(b-a,d-c,.2),floor_mat)


def interior(name,cx,cy,orientation):
    global CURRENT_LAYER
    CURRENT_LAYER="structure"
    X=lambda x:cx+orientation*x
    front,back=cy-5.75,cy+5.75
    # Two 3.34 m storeys with a genuine U-shaped stair opening.
    cube(name+"｜内部一层地面",(cx,cy,1.17),(13.85,11.5,.12),floor_mat)
    hx0,hx1=sorted([X(-6.64),X(-4.47)])
    CURRENT_LAYER="upper"
    slab_opening(name+"｜内部二层",cx-6.95,cx+6.95,front,back,hx0,hx1,cy+1.25,cy+5.45,4.51)
    for floor,base in enumerate([1.23,4.52]):
        CURRENT_LAYER="upper" if floor==1 else "structure"
        height=3.0
        # An internal corridor serves two rooms, with 1.2 m doorway gaps.
        for a,b in [(front,cy-3.3),(cy-2.1,cy+2.1),(cy+3.3,back)]:
            cube(name+f"｜内部{floor}层走廊隔墙",(X(-4.25),(a+b)/2,base+height/2),(.16,b-a,height),partition_mat)
        cube(name+f"｜内部{floor}层房间隔墙",(X(1.32),cy+.15,base+height/2),(10.9,.16,height),partition_mat)
        for lx in [-6.7,1.1,6.7]:
            for ly in [-5.4,.15,5.4]:
                cube(name+f"｜内部{floor}层承重柱",(X(lx),cy+ly,base+1.55),(.24,.24,3.1),timber)
        for ly in [-5.4,.15,5.4]:
            cube(name+f"｜内部{floor}层横梁",(cx,cy+ly,base+3.02),(13.65,.24,.26),timber)
        for room_y in [-2.6,2.95]:
            for lx in [-1.8,2.3,5.1]:
                py=cy+room_y
                cube(name+f"｜内部阅览桌{floor}-{lx}-{room_y}",(X(lx),py,base+.77),(1.8,1.08,.09),furniture_mat)
                for dx in [-.68,.68]:
                    for dy in [-.36,.36]:
                        cube(name+"｜内部桌腿",(X(lx+dx),py+dy,base+.36),(.065,.065,.72),timber)
                for dy in [-.95,.95]:
                    cube(name+"｜内部椅座",(X(lx),py+dy,base+.45),(.50,.49,.09),seat_mat)
                    cube(name+"｜内部椅背",(X(lx),py+dy+(.19 if dy>0 else -.19),base+.75),(.50,.07,.59),seat_mat)
                    for dx in [-.19,.19]:
                        for ey in [-.16,.16]:
                            cube(name+"｜内部椅腿",(X(lx+dx),py+dy+ey,base+.21),(.045,.045,.42),timber)
            # Shelves have visible shelves and book spines, with clear circulation space.
            for lx in [-1.7,2.1,5.4]:
                shelf_y=cy+(-5.15 if room_y<0 else 5.15)
                for dx in [-.85,.85]:
                    cube(name+"｜内部书架侧板",(X(lx+dx),shelf_y,base+.95),(.08,.40,1.9),furniture_mat)
                for level in range(5):
                    z=base+.12+level*.40
                    cube(name+"｜内部书架层板",(X(lx),shelf_y,z),(1.77,.42,.06),furniture_mat)
                    if level<4:
                        for b in range(8):
                            cube(name+"｜内部书册",(X(lx-.68+b*.185),shelf_y,z+.18),(.13,.28,.29+(b%3)*.02),book_mats[b%4])
    CURRENT_LAYER="structure"
    # 20 rises of 167 mm, 280 mm treads, two 0.95 m flights and a landing.
    start_y=cy+1.5
    for flight in range(2):
        sx=-6.09+flight*1.04
        for step in range(10):
            top=1.17+(flight*10+step+1)*.167
            yy=start_y+(step if flight==0 else 9-step)*.28
            cube(name+"｜内部U形楼梯踏步",(X(sx),yy,top-.065),(.95,.29,.13),stone)
            if step%3==0:
                beam_between(name+"｜内部楼梯栏杆立杆",(X(sx+(.43 if flight==0 else -.43)),yy,top),(X(sx+(.43 if flight==0 else -.43)),yy,top+.9),.035,.035,light_stem)
        a=(X(sx),start_y if flight==0 else start_y+2.52,1.34+flight*1.67)
        b=(X(sx),start_y+2.52 if flight==0 else start_y,2.84+flight*1.67)
        beam_between(name+"｜内部楼梯梯梁",a,b,.12,.16,timber)
        rail_x=X(sx+(.43 if flight==0 else -.43))
        beam_between(name+"｜内部楼梯扶手",(rail_x,a[1],a[2]+.9),(rail_x,b[1],b[2]+.9),.055,.055,light_stem)
    cube(name+"｜内部楼梯中间平台",(X(-5.57),start_y+3.0,2.84-.08),(2.10,.7,.16),floor_mat)
    # The open well is guarded along its room-facing edge.
    CURRENT_LAYER="upper"
    for ly in [1.4,2.4,3.4,4.4,5.25]:
        cube(name+"｜内部楼梯洞口栏杆",(X(-4.46),cy+ly,4.98),(.04,.04,.94),light_stem)
    cube(name+"｜内部洞口扶手",(X(-4.46),cy+3.32,5.46),(.06,3.98,.06),timber)
    CURRENT_LAYER="structure"


def build_wing(name,cx,y_center,width=14.2,depth=11.8,eaves=7.8,peak=10.95):
    front,back=y_center-depth/2,y_center+depth/2
    cube(name+"｜台基",(cx,y_center,.58),(width+.82,depth+.82,1.16),stone)
    facade(name+"｜正面",cx,front,width,eaves)
    facade(name+"｜背面",cx,back,width,eaves,angle=math.pi)
    facade(name+"｜左侧",cx-width/2,y_center,depth,eaves,count=4,angle=-math.pi/2,door_index=2 if cx>0 else None)
    facade(name+"｜右侧",cx+width/2,y_center,depth,eaves,count=4,angle=math.pi/2,door_index=1 if cx<0 else None)
    gable_triangle(name+"｜正面山墙",cx,front-.025,width,eaves,peak,wall)
    gable_triangle(name+"｜背面山墙",cx,back+.025,width,eaves,peak,wall_shadow)
    roof_width=width+1.5
    gable_roof(name+"｜山墙屋面",cx,roof_width,front-.9,back+.9,eaves+.32,peak+.28,roof)
    cube(name+"｜屋脊收边",(cx,y_center,peak+.34),(.34,depth+1.98,.28),roof_edge)
    for i in range(1,40):
        tx=cx-roof_width/2+i*roof_width/40
        tz=eaves+.34+(peak-eaves-.04)*(1-abs(tx-cx)/(roof_width/2))
        cube(name+f"｜瓦垄{i}",(tx,y_center,tz),(.045,depth+1.8,.055),roof_edge)
    cube(name+"｜檐下横梁",(cx,front-.19,eaves-.03),(width+.2,.32,.30),timber)
    for side in [-1,1]:
        beam_between(name+"｜山墙斜梁",(cx+side*(width/2-.3),front-.13,eaves+.2),(cx,front-.13,peak-.18),.16,.19)
    # Three timber king-post trusses stay attached to the structural frame.
    for yy in [y_center-3.9,y_center,y_center+3.9]:
        cube(name+"｜内部屋架拉梁",(cx,yy,eaves-.17),(width-.5,.20,.24),timber)
        beam_between(name+"｜内部屋架左弦",(cx-width/2+.25,yy,eaves),(cx,yy,peak-.25),.16,.18)
        beam_between(name+"｜内部屋架右弦",(cx+width/2-.25,yy,eaves),(cx,yy,peak-.25),.16,.18)
        cube(name+"｜内部屋架中柱",(cx,yy,(eaves+peak)/2-.12),(.16,.16,peak-eaves-.1),timber)
    interior(name,cx,y_center,1 if cx>0 else -1)


def create_tree(name, x, y, scale=1.0):
    trunk_height = 3.2 * scale
    cylinder(name + "｜树干", (x, y, trunk_height / 2), 0.18 * scale, trunk_height, trunk_mat, vertices=10)
    for branch_index in range(5):
        theta = branch_index * 2.4
        start = Vector((x, y, 1.8 * scale))
        end = Vector((x + math.cos(theta) * 1.0 * scale, y + math.sin(theta) * 0.85 * scale, (3.0 + .2 * branch_index) * scale))
        delta = end - start
        branch = cylinder(name + f"｜枝干{branch_index}", (start + end) / 2,
                          .085 * scale, delta.length, trunk_mat, vertices=8)
        branch.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    for index in range(42):
        theta = random.uniform(0, math.pi * 2)
        radial = math.sqrt(random.random()) * 1.65
        dx, dy = math.cos(theta) * radial, math.sin(theta) * radial * .82
        dz = random.uniform(-.55, .75) + .75 * (1 - radial / 1.65)
        radius = random.uniform(.45, .77)
        material = leaf_mats[index % len(leaf_mats)]
        varied = scale * radius
        sphere(name + f"｜叶簇{index + 1}",
               (x + dx * scale, y + dy * scale, (3.45 + dz) * scale),
               (varied * 1.1, varied, varied * .86), material)

def create_lamp(name, x, y):
    cylinder(name + "｜灯柱", (x, y, 1.06), 0.075, 2.12, light_stem, vertices=10, collection="02 庭院与铺装")
    cube(name + "｜灯罩", (x, y, 2.2), (0.42, 0.42, 0.22), light_glow, collection="02 庭院与铺装")
    cylinder(name + "｜灯座", (x, y, 0.18), 0.20, 0.30, stone, vertices=10, collection="02 庭院与铺装")


# Main lawn, central tiled walk, and the broad forecourt.
cube("庭院草坪｜地面", (0, -5.5, -0.42), (240, 210, 0.72), grass, collection="02 庭院与铺装")
cube("建筑前广场｜铺装底面", (0, -5.5, 0.04), (39, 12.5, 0.18), path_mats[0], collection="02 庭院与铺装")

# Plaza paving joints, in a loose, hand-laid rectangular rhythm.
for row in range(4):
    y = -10.3 + row * 2.75
    stagger = 1.15 if row % 2 else 0.0
    for col in range(9):
        x = -17.4 + col * 4.35 + stagger
        if x > 18.0:
            continue
        cube(f"前广场石板｜{row + 1}-{col + 1}", (x, y, 0.165), (4.12, 2.50, 0.035),
             path_mats[(row + col) % len(path_mats)], collection="02 庭院与铺装")

# A straight path eases the eye from the foreground toward the entrance.
for index in range(17):
    y = -32.0 + index * 1.32
    cube(f"中轴步道｜石板{index + 1:02d}", (0, y, 0.12), (5.2, 1.18, 0.15),
         path_mats[(index * 2) % len(path_mats)], collection="02 庭院与铺装")

# Symmetrical public building with two gabled wings and a lower central entrance.
build_wing("东翼", 10.2, 2.25)
build_wing("西翼", -10.2, 2.25)
center_width, center_depth = 7.1, 8.9
center_y = 1.45
center_front = center_y - center_depth / 2
cube("中央连接体｜台基", (0, center_y, 0.54), (center_width + 0.8, center_depth + 0.65, 1.08), stone)
cube("中央门厅｜内部地面",(0,center_y,1.17),(center_width-.25,center_depth-.25,.14),floor_mat)
for side in [-1,1]:
    door_y=2.25-(11.8-2.9)/6
    door_half=.70
    for start,end in [(center_y-center_depth/2,door_y-door_half),(door_y+door_half,center_y+center_depth/2)]:
        cube("中央门厅｜侧墙"+str(side),(side*(center_width/2-.12),(start+end)/2,2.8),(.24,end-start,3.25),wall)
    cube("中央门厅｜侧门过梁"+str(side),(side*(center_width/2-.12),door_y,3.86),(.24,door_half*2,1.14),wall)
cube("中央门厅｜后墙",(0,center_y+center_depth/2,2.8),(center_width,.24,3.25),wall)
for side in [-1,1]:
    cube("中央门厅｜入口墙墩"+str(side),(side*2.83,center_front,2.8),(1.4,.26,3.25),wall)
cube("中央门厅｜入口上梁",(0,center_front,4.22),(4.25,.28,.55),wall)
for side in [-1,1]:
    cube("中央门厅｜内部接待台"+str(side),(side*2.2,center_y,1.68),(1.05,2.25,1.0),furniture_mat)
    cube("中央门厅｜内部接待台面"+str(side),(side*2.2,center_y,2.22),(1.15,2.35,.08),floor_mat)
gable_triangle("中央入口｜山墙", 0, center_front - 0.03, center_width, 4.53, 6.24, wall)
gable_triangle("中央入口｜背面山墙", 0, center_y + center_depth / 2 + 0.03, center_width, 4.53, 6.24, wall_shadow)
center_roof_width = center_width + 1.18
gable_roof("中央入口｜山墙屋面", 0, center_roof_width, center_front - 0.75,
           center_y + center_depth / 2 + 0.75, 4.78, 6.43, roof)
cube("中央入口｜屋脊收边", (0, center_y, 6.49), (0.32, center_depth + 1.6, 0.25), roof_edge)

window_unit("中央入口｜暖光门扇", 0, center_front - 0.20, 0.92, 2.65, 2.95, glowing=True)
# Door frame, side lights, and a simple, uncluttered lintel.
for side in (-1, 1):
    cube(f"中央入口｜门侧木框{side}", (side * 1.58, center_front - 0.27, 2.33), (0.16, 0.20, 3.12), timber)
    window_unit(f"中央入口｜侧窗{side}", side * 2.72, center_front - 0.12, 1.75, 0.72, 1.98, glowing=(side > 0))
cube("中央入口｜门楣", (0, center_front - 0.26, 3.92), (3.45, 0.20, 0.18), timber)

# Low, wide steps lead up to the entrance and keep the plaza legible.
for index in range(5):
    height = (index + 1) * 0.18
    cube(f"入口台阶｜第{index + 1}级", (0, -5.72 + index * 0.46, height / 2),
         (9.6, 0.5, height), stone, collection="02 庭院与铺装")

# Landscape is kept at the edges so the architecture remains readable.
for index, (x, y, scale) in enumerate([
    (-21.5, -5.0, 1.30), (-22.8, 5.5, 1.10), (-20.8, 14.5, 1.25),
    (-25.0, 10.0, 1.05), (21.5, -4.0, 1.25), (23.0, 6.5, 1.32),
    (20.7, 15.0, 1.15), (25.0, 11.0, 1.02),
]):
    create_tree(f"庭院树木{index + 1:02d}", x, y, scale)

# Restrained hedges frame the plaza, rather than forming a card-like row of props.
for side in (-1, 1):
    for index in range(5):
        y = -10.5 + index * 4.5
        x = side * (14.8 + (0.35 if index % 2 else 0.0))
        for shrub_index in range(7):
            dx = (shrub_index % 4 - 1.5) * .55
            dy = (shrub_index // 4 - .5) * .65
            sphere(f"边缘灌木｜{side}-{index}-{shrub_index}",
                   (x + dx, y + dy, .38 + random.uniform(-.06, .12)),
                   (.62, .52, .45 + random.uniform(-.05, .12)), leaf_mats[shrub_index % 3])

# Warm wayfinding lamps sit just beyond the central walk.
for y in (-13.5, -20.0, -26.5):
    for side in (-1, 1):
        create_lamp(f"中轴庭灯｜{side}-{abs(y)}", side * 4.25, y)

# Editable preview lighting and camera for opening the companion .blend file.
world = bpy.data.worlds.new("黄昏天空｜蓝紫至暖橙") if not bpy.data.worlds else bpy.data.worlds[0]
world.name = "黄昏天空｜蓝紫至暖橙"
world.use_nodes = True
world.node_tree.nodes.clear()
background = world.node_tree.nodes.new("ShaderNodeBackground")
world_output = world.node_tree.nodes.new("ShaderNodeOutputWorld")
world.node_tree.links.new(background.outputs["Background"], world_output.inputs["Surface"])
background.inputs["Color"].default_value = (*rgb("#596477"), 1.0)
background.inputs["Strength"].default_value = 0.34
scene.world = world

sun_data = bpy.data.lights.new("低角度暮光｜暖色主光", type="SUN")
sun = bpy.data.objects.new("低角度暮光｜暖色主光", sun_data)
COLLECTIONS["04 灯光与摄影机"].objects.link(sun)
sun.location = (-18, 11, 28)
sun.rotation_euler = (math.radians(33), math.radians(-20), math.radians(-28))
sun_data.energy = 1.3
sun_data.color = rgb("#FFAD80")
sun_data.angle = math.radians(16)

fill_data = bpy.data.lights.new("天空漫射｜冷色补光", type="AREA")
fill = bpy.data.objects.new("天空漫射｜冷色补光", fill_data)
COLLECTIONS["04 灯光与摄影机"].objects.link(fill)
fill.location = (7, -18, 15)
fill_data.energy = 1800
fill_data.color = rgb("#9CB3D1")
fill_data.shape = "DISK"
fill_data.size = 18
fill.rotation_euler = (math.radians(28), 0, math.radians(18))

camera_data = bpy.data.cameras.new("校园主庭｜展示摄影机")
camera = bpy.data.objects.new("校园主庭｜展示摄影机", camera_data)
COLLECTIONS["04 灯光与摄影机"].objects.link(camera)
camera.location = (29, -43, 20)
target = Vector((0, -2, 5.2))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.lens = 42
scene.camera = camera

scene.render.engine = "CYCLES"
scene.render.resolution_x = 1600
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.film_transparent = False
scene.render.filepath = os.path.join(ASSETS, "campus-preview.png")
bpy.context.preferences.filepaths.save_version = 0
scene.camera.data.dof.use_dof = False

# Give meshes a modest bevel in the native .blend without requiring any external assets.
# The bevels are deliberately subtle; the browser model stays fast and clean.
for obj in list(scene.objects):
    if obj.type == "MESH" and obj.name.endswith(("台基", "石板", "灯罩", "灯座")):
        modifier = obj.modifiers.new(name="细微倒角", type="BEVEL")
        modifier.width = 0.035
        modifier.segments = 2
        obj.modifiers.new(name="加权法线", type="WEIGHTED_NORMAL")

# Export semantic components as glTF extras. Roof cover and gables are movable;
# load-bearing trusses, columns, stair and floor plates remain stationary.
for obj in scene.objects:
    if obj.type != "MESH":
        continue
    name = obj.name
    obj["building"] = "east" if name.startswith("东翼") else "west" if name.startswith("西翼") else "entry" if name.startswith(("中央",)) else "landscape"
    if any(token in name for token in ["山墙屋面", "屋脊收边", "瓦垄", "正面山墙", "背面山墙", "山墙斜梁"]) or name == "中央入口｜山墙":
        obj["component"] = "roof"
    elif "内部" in name:
        obj["component"] = "interior"
    else:
        obj["component"] = "body"

blend_path = os.path.join(ASSETS, "qinghe-campus.blend")
glb_path = os.path.join(ASSETS, "campus.glb")
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = None
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format="GLB",
    export_cameras=False,
    export_lights=False,
    export_apply=True,
    export_extras=True,
)
print("Campus scene saved:", blend_path)
print("Three.js model exported:", glb_path)
print("Mesh count:", sum(1 for obj in scene.objects if obj.type == "MESH"))





