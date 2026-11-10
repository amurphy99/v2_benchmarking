"""
Landmark icons a Map Task map file may name.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.map_icons`

Each name is one picture the clients draw a landmark with, from the game-icons
set (the web app's copy maps each name to its picture in
`frontend/src/components/map_task/mapTaskIcons.ts`). A map file naming any other
icon is refused at startup. To add one, add its name here and its picture there.

"""
# Every icon name, by kind
MAP_TASK_ICONS = frozenset({
    # Water
    "lake", "river", "waterfall", "island", "swamp", "fountain", "well", "dam", "rapids",

    # Land
    "mountain", "peak", "hill", "volcano", "cave", "rock", "falling_rocks", "cliff", "desert",
    "oasis", "iceberg", "field", "wheat", "valley",

    # Plants
    "tree", "pine_tree", "palm_tree", "birch_trees", "fruit_tree", "willow_tree", "forest",
    "cactus", "sunflower", "rose", "mushrooms", "bush", "tall_grass", "flowers", "vegetables",

    # Buildings
    "house", "cabin", "hut", "village", "city", "castle", "castle_ruins", "ruins", "tower",
    "watchtower", "church", "temple", "pyramid", "windmill", "water_mill", "lighthouse", "barn",
    "silo", "greenhouse", "factory", "shop", "bank", "hospital", "post_office", "theater",
    "tree_house", "tent", "tipi", "igloo", "radio_tower", "water_tower", "pagoda", "saloon",
    "fort",

    # Places and structures
    "bridge", "rope_bridge", "pier", "harbor", "mine", "graveyard", "tombstone", "campfire",
    "park_bench", "street_light", "mailbox", "signpost", "crossroads", "railway", "stairs", "gate",
    "fence", "wall", "obelisk", "totem", "carousel", "swing", "oil_rig", "crane", "gas_pump",
    "radar_dish", "stone_path", "gallows",

    # Vehicles
    "bus", "bus_stop", "car", "truck", "van", "caravan", "tractor", "train", "bicycle", "sailboat",
    "fishing_boat", "ship", "sinking_ship", "canoe", "raft", "airplane", "helicopter",
    "hot_air_balloon", "wagon", "wheelbarrow",

    # Animals
    "sheep", "cow", "pig", "horse", "goat", "chicken", "rooster", "duck", "swan", "goose", "dog",
    "cat", "deer", "rabbit", "fox", "wolf", "bear", "owl", "eagle", "parrot", "flamingo",
    "ostrich", "penguin", "monkey", "gorilla", "elephant", "lion", "camel", "bison", "kangaroo",
    "turtle", "frog", "fish", "crab", "snake", "butterfly", "bee", "beehive", "dolphin", "whale",

    # Things
    "scarecrow", "treasure", "anchor", "buoy", "clock", "bell", "umbrella", "kite", "barrel",
    "crate", "pumpkin", "bones", "skull", "telephone", "snowman", "wagon_wheel", "stone_block",
    "anvil", "bread",
})
