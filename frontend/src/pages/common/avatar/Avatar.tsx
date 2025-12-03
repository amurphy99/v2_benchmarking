import { PerspectiveCamera  } from "@react-three/drei";
import { Canvas             } from "@react-three/fiber";

import Model from "./Model"
import { useEffect } from "react";

// Avatar Model
export default function Avatar( { animation, animCount }) {
    return (
        <div className="h-full w-full">
            <Canvas>
                <PerspectiveCamera makeDefault position={[0,  0, 10]} fov={50} />
                <directionalLight              position={[0, 10, 10]} intensity={5} />
                <Model animation={animation} animCount={animCount} />
            </Canvas>
        </div>
    );
}
