import React, { useRef, useEffect, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

function Model(props) {
    const { nodes, materials, animations } = useGLTF('/models/shaking_anim.glb');
    const group = useRef();
    const [animation, setAnimation] = useState(animations[0].name);
    const { actions, mixer } = useAnimations(animations, group);
    
    useEffect(() => {
        actions[animation]
        .reset()
        .fadeIn(mixer.stats.actions.inUse === 0 ? 0 : 0.5)
        .play();
        return () => actions[animation].fadeOut(0.5);
    }, [animation]);

    return (
        <group scale={100} position={[0, -4, 0]} ref={group} {...props} dispose={null}>
            <group name="Scene">
            <group name="avatarModel_shell" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
            <mesh
                name="Mesh"
                castShadow
                receiveShadow
                geometry={nodes.Mesh.geometry}
                material={materials.bodyWhite_blinn}
            />
            <mesh
                name="Mesh_1"
                castShadow
                receiveShadow
                geometry={nodes.Mesh_1.geometry}
                material={materials.bodyCyan_emissive}
            />
            </group>
            <group name="avatarModel_core" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
            <mesh
                name="Mesh001"
                castShadow
                receiveShadow
                geometry={nodes.Mesh001.geometry}
                material={materials.bodyWhite_blinn}
            />
            <mesh
                name="Mesh001_1"
                castShadow
                receiveShadow
                geometry={nodes.Mesh001_1.geometry}
                material={materials.bodyCyan_emissive}
            />
            </group>
            <mesh
            name="avatarModel_neck"
            castShadow
            receiveShadow
            geometry={nodes.avatarModel_neck.geometry}
            material={materials.bodyWhite_blinn}
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.01}
            />
            <group name="avatarModel_head" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
            <mesh
                name="Mesh003"
                castShadow
                receiveShadow
                geometry={nodes.Mesh003.geometry}
                material={materials.bodyWhite_blinn}
            />
            <mesh
                name="Mesh003_1"
                castShadow
                receiveShadow
                geometry={nodes.Mesh003_1.geometry}
                material={materials.bodyBlack_blinn}
            />
            <group name="face" position={[0, 0.181, -6.763]} scale={[0.216, 1.031, 0.216]} />
            </group>
            <mesh
            name="avatarModel_shoulderL"
            castShadow
            receiveShadow
            geometry={nodes.avatarModel_shoulderL.geometry}
            material={materials.bodyWhite_blinn}
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.01}
            />
            <group name="front_wheels" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
            <mesh
                name="Mesh005"
                castShadow
                receiveShadow
                geometry={nodes.Mesh005.geometry}
                material={materials.wheelsBlack}
            />
            <mesh
                name="Mesh005_1"
                castShadow
                receiveShadow
                geometry={nodes.Mesh005_1.geometry}
                material={materials.wheelsRim}
            />
            </group>
            <group name="back_wheel" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
            <mesh
                name="Mesh006"
                castShadow
                receiveShadow
                geometry={nodes.Mesh006.geometry}
                material={materials.wheelsBlack}
            />
            <mesh
                name="Mesh006_1"
                castShadow
                receiveShadow
                geometry={nodes.Mesh006_1.geometry}
                material={materials.wheelsRim}
            />
            </group>
        </group>
      </group>
    )
}

useGLTF.preload('/Noding.glb')

export default Model;