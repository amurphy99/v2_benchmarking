import { PerspectiveCamera  } from "@react-three/drei";
import { Canvas             } from "@react-three/fiber";
import BuddyModel from "./BuddyModel"
import QTModel from "./QTModel";

// Avatar Model
export default function Avatar( { animation, animCount, model, zoom } : { animation: string, animCount: number, model: string, zoom: string}) {
    return (
        <div className="h-full w-full">
            <Canvas>
                <PerspectiveCamera makeDefault position={[0,  0, 10]} fov={50} />
                <directionalLight              position={[0, 10, 10]} intensity={5} />
                { (model == "Buddy" || model == "buddy") ?
                    <BuddyModel animation={animation} animCount={animCount} zoom={zoom} /> : 
                    <QTModel animation={animation} animCount={animCount} zoom={zoom} /> 
                }
            </Canvas>
        </div>
    );
}
