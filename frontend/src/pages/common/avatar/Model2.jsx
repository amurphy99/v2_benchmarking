import React, { useRef, useEffect, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

function Model2(props) {
    const { nodes, materials, animations } = useGLTF('/models/shaking_head.glb');
    const group = useRef();
    const [animation, setAnimation] = useState(animations[3].name);
    const { actions, mixer } = useAnimations(animations, group);
    
    useEffect(() => {
        // Make sure the animations are there before trying to play them / fade out
        if (!actions || !actions[animation]) {console.warn("Animation action not ready yet"); return;}

        actions[animation].reset().fadeIn(mixer?.stats?.actions?.inUse === 0 ? 0 : 0.5).play();
        
        return () => {if (actions[animation]) {actions[animation].fadeOut(0.5);}}
    
    }, [animation, actions, mixer]); // [animation]

    
    return (
        <group scale={100} position={[0, -4, 0]} ref={group} {...props} dispose={null}>
            <group name="Scene">
            
            <group name="avatarModel_shell" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
                <mesh name="Mesh"   castShadow receiveShadow geometry={nodes.Mesh  .geometry} material={materials.bodyWhite_blinn  } />
                <mesh name="Mesh_1" castShadow receiveShadow geometry={nodes.Mesh_1.geometry} material={materials.bodyCyan_emissive} />
            </group>

            <group name="avatarModel_core" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
                <mesh name="Mesh001"   castShadow receiveShadow geometry={nodes.Mesh001  .geometry} material={materials.bodyWhite_blinn  } />
                <mesh name="Mesh001_1" castShadow receiveShadow geometry={nodes.Mesh001_1.geometry} material={materials.bodyCyan_emissive} />
            </group>
            
            <mesh name="avatarModel_neck" castShadow receiveShadow 
                geometry={nodes.avatarModel_neck.geometry} 
                material={materials.bodyWhite_blinn}
                rotation={[Math.PI / 2, 0, 0]}
                scale={0.01}
            />

            <group name="avatarModel_head" rotation={[Math.PI / 2, 0, -0.01]} scale={0.01}>
                <mesh name="Mesh003"   castShadow receiveShadow geometry={nodes.Mesh003  .geometry} material={materials.bodyWhite_blinn }/>
                <mesh name="Mesh003_1" castShadow receiveShadow geometry={nodes.Mesh003_1.geometry} material={materials.Default_Material} />
                <mesh
                    name="screen"
                    castShadow
                    receiveShadow
                    geometry={nodes.screen.geometry}
                    material={materials.lambert2}
                    position={[0, 0.126, -6.759]}
                    scale={[2.817, 0.057, 1.565]}
                />
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
            
            {/* --------------------------------------------------------------------
              * Wheels 
              * -------------------------------------------------------------------- */}
            <group name="front_wheels" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
                <mesh name="Mesh006"   castShadow receiveShadow geometry={nodes.Mesh006  .geometry} material={materials.wheelsBlack} />
                <mesh name="Mesh006_1" castShadow receiveShadow geometry={nodes.Mesh006_1.geometry} material={materials.wheelsRim  } />
            </group>
            
            <group name="back_wheel" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
                <mesh name="Mesh007"   castShadow receiveShadow geometry={nodes.Mesh007  .geometry} material={materials.wheelsBlack} />
                <mesh name="Mesh007_1" castShadow receiveShadow geometry={nodes.Mesh007_1.geometry} material={materials.wheelsRim  } />
            </group>

      </group>
      </group>
    )
}

useGLTF.preload('/Noding.glb')

export default Model2;