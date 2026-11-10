/* Landmark pictures for Map Task maps, by the icon names map files use.
--------------------------------------------------------------------------------
`@frontend/src/components/map_task/mapTaskIcons`

The names copy `MAP_TASK_ICONS` in
`backend/chat_app/websocket/harnesses/map_task/map_icons.py`, which refuses a map
file naming any other icon. Each picture is from the game-icons set. To add one,
add its name there and its picture here.

*/
import type { IconType                                                                                                      } from "react-icons";
import      { GiAirBalloon, GiAirplane, GiAnchor, GiAncientRuins, GiAnimalSkull, GiAnvil, GiBank, GiBarn, GiBarrel          } from "react-icons/gi";
import      { GiBearHead, GiBee, GiBeehive, GiBerryBush, GiBigWave, GiBirchTrees, GiBison, GiBus, GiBusStop, GiButterfly    } from "react-icons/gi";
import      { GiCactus, GiCamel, GiCampfire, GiCampingTent, GiCandlestickPhone, GiCanoe, GiCaravan, GiCargoCrane            } from "react-icons/gi";
import      { GiCargoShip, GiCarousel, GiCarrot, GiCartwheel, GiCastle, GiCastleRuins, GiCat, GiCaveEntrance                } from "react-icons/gi";
import      { GiCheckeredFlag, GiChicken, GiChurch, GiCirclingFish, GiCityCar, GiCow, GiCrab, GiCrossroad, GiCuckooClock    } from "react-icons/gi";
import      { GiDam, GiDeer, GiDesert, GiDinosaurBones, GiDirectionSign, GiDolphin, GiDuck, GiDutchBike, GiEagleHead        } from "react-icons/gi";
import      { GiEgyptianPyramids, GiElephant, GiFactory, GiFallingRocks, GiFamilyHouse, GiFarmTractor, GiField              } from "react-icons/gi";
import      { GiFishingBoat, GiFlamingo, GiFlowers, GiForest, GiFountain, GiFox, GiFrog, GiFruitTree, GiGasPump, GiGate     } from "react-icons/gi";
import      { GiGibbet, GiGoat, GiGoldMine, GiGoose, GiGorilla, GiGraveyard, GiGreekTemple, GiGreenhouse, GiHarborDock      } from "react-icons/gi";
import      { GiHelicopter, GiHighGrass, GiHills, GiHorseHead, GiHospital, GiHut, GiIceberg, GiIgloo, GiIsland, GiKangaroo  } from "react-icons/gi";
import      { GiKite, GiLifeBuoy, GiLighthouse, GiLion, GiMailbox, GiMilitaryFort, GiModernCity, GiMonkey, GiMountains      } from "react-icons/gi";
import      { GiMountaintop, GiMushroomsCluster, GiOak, GiOasis, GiObelisk, GiOilRig, GiOldWagon, GiOpenTreasureChest       } from "react-icons/gi";
import      { GiOstrich, GiOwl, GiPagoda, GiPalmTree, GiParkBench, GiParrotHead, GiPenguin, GiPig, GiPineTree, GiPostOffice } from "react-icons/gi";
import      { GiPumpkin, GiRabbit, GiRadarDish, GiRadioTower, GiRaft, GiRailway, GiRattlesnake, GiRingingBell, GiRiver      } from "react-icons/gi";
import      { GiRock, GiRooster, GiRopeBridge, GiRose, GiRoundSilo, GiSailboat, GiSaloon, GiScarecrow, GiSeaCliff, GiSheep  } from "react-icons/gi";
import      { GiShop, GiSinkingShip, GiSittingDog, GiSlicedBread, GiSnowman, GiStairs, GiSteamLocomotive, GiStoneBlock      } from "react-icons/gi";
import      { GiStoneBridge, GiStonePath, GiStoneTower, GiStoneWall, GiStreetLight, GiSunflower, GiSurferVan, GiSwamp       } from "react-icons/gi";
import      { GiSwan, GiTheater, GiTipi, GiTombstone, GiTotem, GiTreeSwing, GiTreehouse, GiTruck, GiTurtle, GiUmbrella      } from "react-icons/gi";
import      { GiValley, GiVillage, GiVolcano, GiWatchtower, GiWaterMill, GiWaterTower, GiWaterfall, GiWaves, GiWell         } from "react-icons/gi";
import      { GiWhaleTail, GiWheat, GiWheelbarrow, GiWillowTree, GiWindmill, GiWolfHowl, GiWoodCabin, GiWoodenCrate         } from "react-icons/gi";
import      { GiWoodenFence, GiWoodenPier                                                                                   } from "react-icons/gi";

// The finish of a route
export const MAP_TASK_FINISH_ICON: IconType = GiCheckeredFlag;

// Every landmark picture, by name
export const MAP_TASK_ICONS: Record<string, IconType> = {
    // Water
    lake      : GiWaves,
    river     : GiRiver,
    waterfall : GiWaterfall,
    island    : GiIsland,
    swamp     : GiSwamp,
    fountain  : GiFountain,
    well      : GiWell,
    dam       : GiDam,
    rapids    : GiBigWave,

    // Land
    mountain      : GiMountains,
    peak          : GiMountaintop,
    hill          : GiHills,
    volcano       : GiVolcano,
    cave          : GiCaveEntrance,
    rock          : GiRock,
    falling_rocks : GiFallingRocks,
    cliff         : GiSeaCliff,
    desert        : GiDesert,
    oasis         : GiOasis,
    iceberg       : GiIceberg,
    field         : GiField,
    wheat         : GiWheat,
    valley        : GiValley,

    // Plants
    tree        : GiOak,
    pine_tree   : GiPineTree,
    palm_tree   : GiPalmTree,
    birch_trees : GiBirchTrees,
    fruit_tree  : GiFruitTree,
    willow_tree : GiWillowTree,
    forest      : GiForest,
    cactus      : GiCactus,
    sunflower   : GiSunflower,
    rose        : GiRose,
    mushrooms   : GiMushroomsCluster,
    bush        : GiBerryBush,
    tall_grass  : GiHighGrass,
    flowers     : GiFlowers,
    vegetables  : GiCarrot,

    // Buildings
    house        : GiFamilyHouse,
    cabin        : GiWoodCabin,
    hut          : GiHut,
    village      : GiVillage,
    city         : GiModernCity,
    castle       : GiCastle,
    castle_ruins : GiCastleRuins,
    ruins        : GiAncientRuins,
    tower        : GiStoneTower,
    watchtower   : GiWatchtower,
    church       : GiChurch,
    temple       : GiGreekTemple,
    pyramid      : GiEgyptianPyramids,
    windmill     : GiWindmill,
    water_mill   : GiWaterMill,
    lighthouse   : GiLighthouse,
    barn         : GiBarn,
    silo         : GiRoundSilo,
    greenhouse   : GiGreenhouse,
    factory      : GiFactory,
    shop         : GiShop,
    bank         : GiBank,
    hospital     : GiHospital,
    post_office  : GiPostOffice,
    theater      : GiTheater,
    tree_house   : GiTreehouse,
    tent         : GiCampingTent,
    tipi         : GiTipi,
    igloo        : GiIgloo,
    radio_tower  : GiRadioTower,
    water_tower  : GiWaterTower,
    pagoda       : GiPagoda,
    saloon       : GiSaloon,
    fort         : GiMilitaryFort,

    // Places and structures
    bridge       : GiStoneBridge,
    rope_bridge  : GiRopeBridge,
    pier         : GiWoodenPier,
    harbor       : GiHarborDock,
    mine         : GiGoldMine,
    graveyard    : GiGraveyard,
    tombstone    : GiTombstone,
    campfire     : GiCampfire,
    park_bench   : GiParkBench,
    street_light : GiStreetLight,
    mailbox      : GiMailbox,
    signpost     : GiDirectionSign,
    crossroads   : GiCrossroad,
    railway      : GiRailway,
    stairs       : GiStairs,
    gate         : GiGate,
    fence        : GiWoodenFence,
    wall         : GiStoneWall,
    obelisk      : GiObelisk,
    totem        : GiTotem,
    carousel     : GiCarousel,
    swing        : GiTreeSwing,
    oil_rig      : GiOilRig,
    crane        : GiCargoCrane,
    gas_pump     : GiGasPump,
    radar_dish   : GiRadarDish,
    stone_path   : GiStonePath,
    gallows      : GiGibbet,

    // Vehicles
    bus             : GiBus,
    bus_stop        : GiBusStop,
    car             : GiCityCar,
    truck           : GiTruck,
    van             : GiSurferVan,
    caravan         : GiCaravan,
    tractor         : GiFarmTractor,
    train           : GiSteamLocomotive,
    bicycle         : GiDutchBike,
    sailboat        : GiSailboat,
    fishing_boat    : GiFishingBoat,
    ship            : GiCargoShip,
    sinking_ship    : GiSinkingShip,
    canoe           : GiCanoe,
    raft            : GiRaft,
    airplane        : GiAirplane,
    helicopter      : GiHelicopter,
    hot_air_balloon : GiAirBalloon,
    wagon           : GiOldWagon,
    wheelbarrow     : GiWheelbarrow,

    // Animals
    sheep     : GiSheep,
    cow       : GiCow,
    pig       : GiPig,
    horse     : GiHorseHead,
    goat      : GiGoat,
    chicken   : GiChicken,
    rooster   : GiRooster,
    duck      : GiDuck,
    swan      : GiSwan,
    goose     : GiGoose,
    dog       : GiSittingDog,
    cat       : GiCat,
    deer      : GiDeer,
    rabbit    : GiRabbit,
    fox       : GiFox,
    wolf      : GiWolfHowl,
    bear      : GiBearHead,
    owl       : GiOwl,
    eagle     : GiEagleHead,
    parrot    : GiParrotHead,
    flamingo  : GiFlamingo,
    ostrich   : GiOstrich,
    penguin   : GiPenguin,
    monkey    : GiMonkey,
    gorilla   : GiGorilla,
    elephant  : GiElephant,
    lion      : GiLion,
    camel     : GiCamel,
    bison     : GiBison,
    kangaroo  : GiKangaroo,
    turtle    : GiTurtle,
    frog      : GiFrog,
    fish      : GiCirclingFish,
    crab      : GiCrab,
    snake     : GiRattlesnake,
    butterfly : GiButterfly,
    bee       : GiBee,
    beehive   : GiBeehive,
    dolphin   : GiDolphin,
    whale     : GiWhaleTail,

    // Things
    scarecrow   : GiScarecrow,
    treasure    : GiOpenTreasureChest,
    anchor      : GiAnchor,
    buoy        : GiLifeBuoy,
    clock       : GiCuckooClock,
    bell        : GiRingingBell,
    umbrella    : GiUmbrella,
    kite        : GiKite,
    barrel      : GiBarrel,
    crate       : GiWoodenCrate,
    pumpkin     : GiPumpkin,
    bones       : GiDinosaurBones,
    skull       : GiAnimalSkull,
    telephone   : GiCandlestickPhone,
    snowman     : GiSnowman,
    wagon_wheel : GiCartwheel,
    stone_block : GiStoneBlock,
    anvil       : GiAnvil,
    bread       : GiSlicedBread,
};
