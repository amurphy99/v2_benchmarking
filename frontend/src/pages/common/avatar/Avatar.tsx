import { PerspectiveCamera, useAnimations, useGLTF } from "@react-three/drei";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { AnimationClip, LoopOnce, Material, Mesh, Object3D } from "three";
import { getAnimationFromEmotion, getZoom } from "./AvatarUtils";
import { Canvas } from "@react-three/fiber";
import QTModel from "./QTModel";
import BuddyModel from "./BuddyModel";

export const AvatarComponent = forwardRef(({ model, zoom, ...props } : { model: string, zoom: string }, ref) => {
     const { nodes, materials, animations } = useGLTF(`/models/${model.toLowerCase()}Robot.glb`) as unknown as { 
        nodes: Record<string, Mesh>, 
        materials: Record<string, Material>, 
        animations: AnimationClip[] 
    };
    const group = useRef<Object3D>(null);
    const { actions, mixer } = useAnimations(animations, group);
    const zoomInfo = getZoom(zoom, model);
  
    const playAnimation = (animation: string) => {
        if (!actions || !animation) return;

        Object.values(actions).forEach((a) => a?.stop());

        const action = mixer.clipAction(animations.find((a) => a.name === animation) as AnimationClip);

        if (!action) return;

        action.reset();
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
    }

    const playEmotion = (emotion: string) => {
        if (!actions || !emotion) return;

        const animation = getAnimationFromEmotion(emotion, model);

        Object.values(actions).forEach((a) => a?.stop());

        const action = mixer.clipAction(animations.find((a) => a.name === animation) as AnimationClip);

        if (!action) return;

        action.reset();
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
    }

    useImperativeHandle(ref, () => ({
        playAnimation, playEmotion
    }));

    if (model.toLowerCase() == "qt") {
        return <QTModel nodes={nodes} materials={materials} scale={zoomInfo.scale} position={zoomInfo.position} group={group} />
    } else {
        return <BuddyModel nodes={nodes} materials={materials} scale={zoomInfo.scale} position={zoomInfo.position} group={group} />
    }
});

export const Avatar = forwardRef(({ model, zoom, ...props } : { model: string, zoom: string }, ref) => {{
    const avatarRef = useRef<any>(null);

    const playAnimation = (animation: string) => {
        if (avatarRef.current) {
            avatarRef.current.playAnimation(animation);
        }
    }

    const playEmotion = (emotion: string) => {
        if (avatarRef.current) {
            avatarRef.current.playEmotion(emotion);
        }
    }

    useImperativeHandle(ref, () => ({
        playAnimation, playEmotion
    }));

    return (
        <div className="h-full w-full">
            <Canvas>
                <PerspectiveCamera makeDefault position={[0,  0, 10]} fov={50} />
                <directionalLight              position={[0, 10, 10]} intensity={5} />
                <AvatarComponent zoom={zoom} model={model} ref={avatarRef} />
            </Canvas>
        </div>
    )
}});