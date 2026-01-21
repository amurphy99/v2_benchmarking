import { PerspectiveCamera  } from "@react-three/drei";
import { Canvas             } from "@react-three/fiber";

import Model2 from "./Model2";

// Avatar Model
export default function Avatar() {
    return (
        <Canvas>
            <PerspectiveCamera makeDefault position={[0,  0, 10]} fov={50} />
            <directionalLight              position={[0, 10, 10]} intensity={5} />
            <Model2 />
        </Canvas>
    );
}
